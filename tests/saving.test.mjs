import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';

// Exercise the real datastore with SQL recording, without a production database.
function harness() {
  const queries = [];
  let fail = false;
  const client = {
    query: async (sql, values) => {
      queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), values });
      if (fail) throw new Error('database unavailable');
      return [[]];
    },
    beginTransaction: async () => {},
    commit: async () => queries.push({ sql: 'COMMIT' }),
    rollback: async () => queries.push({ sql: 'ROLLBACK' }),
    release: () => queries.push({ sql: 'RELEASE' })
  };
  const source = readFileSync(new URL('../src/server/dataStore.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export const /g, 'const ');
  const context = vm.createContext({ crypto, process: { env: {} }, mysql: {
    createPool: () => ({ getConnection: async () => client })
  }});
  vm.runInContext(source + '\ninitializationPromise = Promise.resolve(); globalThis.api = { saveState, normalizeState };', context);
  return { ...context.api, queries, fail: () => { fail = true; } };
}
const fixture = {
  users: [{ id: 'teacher-a' }, { id: 'teacher-b' }], schoolYears: [],
  students: ['a', 'b'].map(id => ({ id, teacherId: `teacher-${id}`, competencyOptions: [], competencies: [] }))
};
test('unchanged snapshot performs no SQL writes', async () => {
  const h = harness(); const state = h.normalizeState(fixture);
  await h.saveState(state, state);
  assert.deepEqual(h.queries.map(q => q.sql), ['COMMIT', 'RELEASE']);
});
test('editing one student leaves other students and users untouched', async () => {
  const h = harness(); const old = h.normalizeState(fixture);
  const next = structuredClone(old); next.students[0].remarks = 'Updated';
  await h.saveState(next, old);
  const inserts = h.queries.filter(q => q.sql.startsWith('INSERT'));
  assert.equal(inserts.length, 1);
  assert.match(inserts[0].sql, /^INSERT INTO students/);
  assert.equal(inserts[0].values[0], 'a');
  assert.ok(!h.queries.some(q => q.values?.includes('b')));
  assert.ok(!h.queries.some(q => q.sql.startsWith('DELETE')));
});
test('removing a student deletes only that ID', async () => {
  const h = harness(); const old = h.normalizeState(fixture);
  await h.saveState({ ...old, students: old.students.slice(1) }, old);
  const deletes = h.queries.filter(q => q.sql.startsWith('DELETE'));
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].sql, 'DELETE FROM students WHERE id IN (?)');
  assert.equal(deletes[0].values[0], 'a');
});
test('database failures roll back and release the connection', async () => {
  const h = harness(); const old = h.normalizeState(fixture); h.fail();
  await assert.rejects(h.saveState({ ...old, students: [] }, old), /database unavailable/);
  assert.deepEqual(h.queries.slice(-2).map(q => q.sql), ['ROLLBACK', 'RELEASE']);
});
test('client sends saves sequentially and recovers after a failed save', async () => {
  const source = readFileSync(new URL('../src/frontend/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const persistAppState = useCallback(');
  const end = source.indexOf('\n  useEffect(', start);
  const calls = [];
  const context = vm.createContext({
    useCallback: fn => fn, saveQueueRef: { current: Promise.resolve() },
    getValidAccessToken: async () => 'session', buildApiUrl: path => path,
    fetch: (_url, options) => new Promise((resolve, reject) => calls.push({ resolve, reject, options }))
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.save = persistAppState;', context);
  const first = context.save([], [{ id: 'first' }]);
  const second = context.save([], [{ id: 'second' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  calls[0].reject(new Error('temporary failure'));
  await assert.rejects(first, /temporary failure/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).students[0].id, 'second');
  calls[1].resolve({ ok: true, status: 200, json: async () => ({}) });
  await second;
});
test('server queues authentication and snapshot loading before each write', async () => {
  const source = readFileSync(new URL('../src/server/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('let stateWriteQueue =');
  const end = source.indexOf('const writeAppState =', start);
  const events = [];
  let handler, release;
  const context = vm.createContext({
    app: { put: (_path, callback) => { handler = callback; } },
    requireAuth: async req => { events.push(`load-${req.id}`); req.user = {}; },
    writeAppState: async req => {
      events.push(`write-${req.id}`);
      if (req.id === 1) await new Promise(resolve => { release = resolve; });
    }
  });
  vm.runInContext(source.slice(start, end), context);
  const errors = [];
  handler({ id: 1 }, {}, error => errors.push(error));
  handler({ id: 2 }, {}, error => errors.push(error));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['load-1', 'write-1']);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['load-1', 'write-1', 'load-2', 'write-2']);
  assert.deepEqual(errors, []);
});

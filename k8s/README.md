# Kubernetes deployment

Ce dossier contient un déploiement de base pour :

- l'application `erapport`
- une base `MariaDB`
- un `Ingress` compatible Traefik sur `websecure`

## Fichiers

- `namespace.yaml` : namespace dédié
- `configmap.yaml` : configuration non sensible
- `mariadb.yaml` : PVC, Deployment et Service MariaDB
- `app.yaml` : Deployment et Service de l'application
- `ingress.yaml` : Ingress Traefik
- `secrets.example.yaml` : exemple de secrets à adapter hors dépôt, incluant OIDC
- `kustomization.yaml` : base Kustomize sans secrets

## Pré-requis

- un cluster Kubernetes avec une `StorageClass` par défaut
- Traefik installé comme contrôleur Ingress
- une image applicative disponible dans un registre accessible au cluster

## Déploiement

1. Construire et publier l'image :

```powershell
docker build -t hurtlinb/erapport:2.2.0 .
docker push hurtlinb/erapport:2.2.0
```

2. L'image configurée dans `app.yaml` est :

```yaml
image: hurtlinb/erapport:2.2.0
```

3. Créer un fichier de secrets séparé à partir de `secrets.example.yaml`, puis ajuster :

- les mots de passe MariaDB
- `DATABASE_URL`
- `KEYCLOAK_URL`
- `KEYCLOAK_REALM`
- `KEYCLOAK_CLIENT_ID`
- `KEYCLOAK_CLIENT_SECRET`
- `SESSION_SECRET`

4. Adapter `ingress.yaml` :

- `spec.rules[0].host` si l'URL change

L'URL actuellement configurée est :

- `erapport.app.emfnet.ch`

5. Déployer :

```powershell
kubectl apply -f k8s/secrets.yaml
kubectl apply -k k8s
```

## Notes

- l'application écoute sur le port `3001`
- le service Kubernetes expose l'application sur le port `80`
- la probe de readiness de l'application utilise `/status`, ce qui vérifie aussi l'accès à MariaDB
- l'Ingress Traefik utilise uniquement l'entrypoint `websecure`
- la gestion des certificats TLS est laissée à la configuration Traefik déjà en place sur le cluster
- l'authentification OIDC utilise `SERVER_BASE_URL` pour le callback et lit `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` et `SESSION_SECRET` depuis le secret applicatif

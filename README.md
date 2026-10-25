# Télécommande PitPat

Télécommande web pour tapis de marche **PitPat**, pilotée en Bluetooth depuis un téléphone.
Elle s'installe comme une application (PWA) et fonctionne ensuite sans réseau.

**Application en ligne :** [https://selqcir.github.io/pitpat-telecommande/](https://selqcir.github.io/pitpat-telecommande/)

## Origine du projet

Ce projet est basé sur les sources de
[**PitPat-WebBT**](https://github.com/keirany/PitPat-WebBT) de **keirany**
([démo](https://keirany.github.io/PitPat-WebBT/)), qui a réalisé le travail de fond :
la connexion Bluetooth, le décodage des données envoyées par le tapis et le format
des commandes. Merci à lui !

Le projet d'origine est publié dans le domaine public ([Unlicense](LICENSE)) ; cette
version conserve la même licence.

Principales évolutions par rapport au projet d'origine :

- interface en français, pensée pour le téléphone (écran de 360 px) ;
- état du tapis et de la connexion Bluetooth sous forme d'icônes ;
- **programmes de marche automatiques** classés par difficulté (15 à 45 min),
  avec aperçu de la courbe de vitesse et suivi en temps réel ;
- application installable (PWA), utilisable hors ligne ;
- petit serveur Node.js pour l'hébergement local ;
- corrections : pas de vitesse de « Ralentir », synchronisation du curseur, unité km/h.

## Prérequis

- **Chrome** ou **Edge** (Android ou ordinateur) : ce sont les navigateurs qui gèrent le
  [Web Bluetooth](https://developer.mozilla.org/fr/docs/Web/API/Web_Bluetooth_API).
  Firefox et Safari (iPhone) ne le gèrent pas.
- La page doit être servie en **HTTPS** (ou ouverte via `http://localhost`).

## Installation sur le téléphone (PWA)

1. Ouvrir l'application dans Chrome (adresse ci-dessus, ou votre serveur local en HTTPS).
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. L'ouvrir une seconde fois avec Internet pour que tout soit mis en cache ;
   elle fonctionne ensuite sans réseau.

## Hébergement local (Node.js)

Aucune dépendance à installer, Node.js 14 ou plus suffit :

```sh
npm start              # http://localhost:8080
PORT=3000 npm start    # autre port
```

Pour un accès depuis le téléphone sur le réseau local, il faut du HTTPS : placer
`cert.pem` et `key.pem` à côté de `server.js` et le serveur démarre automatiquement en
HTTPS. Par exemple avec [mkcert](https://github.com/FiloSottile/mkcert) :

```sh
mkcert -install
mkcert -cert-file cert.pem -key-file key.pem <ip-du-pc> localhost 127.0.0.1
```

Puis installer le certificat racine (`rootCA.pem`, dossier donné par `mkcert -CAROOT`)
sur le téléphone : *Paramètres → Sécurité → Chiffrement et identifiants → Installer un
certificat → Certificat CA*. Ces fichiers ne doivent jamais être publiés (exclus par
`.gitignore`).

## Ajouter un programme de marche

Les programmes sont définis en haut de [`programs.js`](programs.js). Chaque programme est
une liste de points `[minute, vitesse en km/h]` ; la vitesse varie progressivement entre
deux points (de 1 à 6 km/h) :

```js
{
    name: "Mon programme",
    level: 2,                       // difficulté de 1 à 5
    description: "Échauffement puis 4 km/h",
    points: [[0, 2], [5, 4], [15, 4], [20, 1]]
}
```

La liste est triée automatiquement par difficulté puis par durée. Pour un fractionné,
`intervals(début, répétitions, minutes rapides, vitesse rapide, minutes lentes, vitesse lente)`
génère les répétitions.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Interface |
| `treadmill.js` | Bluetooth, protocole du tapis, commandes |
| `programs.js` | Programmes de marche |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Application installable (PWA) |
| `status-*.png` | Icônes d'état du tapis |
| `server.js` | Serveur local optionnel |
| `sources/` | Images d'origine des icônes |

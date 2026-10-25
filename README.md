# PitPat Treadmill Web Dashboard

A web-based dashboard to control and monitor a PitPat treadmill via Bluetooth. This tool provides real-time data visualization and treadmill control.

## Prerequisites

- A compatible browser (e.g., Chromium, Firefox, or other browsers supporting the [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility))


## Hébergement local (Node.js)

Aucune dépendance à installer, Node.js 14 ou plus suffit :

```sh
npm start              # http://localhost:8080
PORT=3000 npm start    # autre port
```

Web Bluetooth n'est autorisé que sur **HTTPS** ou sur **http://localhost**. Pour utiliser la
télécommande depuis un téléphone sur le réseau local, deux options :

- **HTTPS** : fournir un certificat et sa clé :
  `TLS_CERT=cert.pem TLS_KEY=key.pem npm start`
  (par exemple généré avec [mkcert](https://github.com/FiloSottile/mkcert)) ;
- **Chrome Android** : ouvrir `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
  y ajouter `http://<ip-du-serveur>:8080`, puis redémarrer Chrome.

## Installation sur le téléphone (PWA)

Une fois la page ouverte dans Chrome via HTTPS (ou une origine autorisée par le flag
ci-dessus) : menu ⋮ → **Ajouter à l'écran d'accueil** / **Installer l'application**.
L'application s'ouvre ensuite en plein écran, avec sa propre icône.

## Live Demo

[https://keirany.github.io/PitPat-WebBT/](https://keirany.github.io/PitPat-WebBT/)

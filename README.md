# Pliage

Boîte à outils PDF et fichiers pour Android : fusionner, découper, convertir, compresser, modifier et signer des PDF. Le tout est gratuit, sans compte, sans publicité, et fonctionne hors ligne. Seule la conversion « haute fidélité » passe par internet, et uniquement si tu la choisis.

## Installer l'application sur le téléphone

1. Sur ton téléphone, ouvre la page **Releases** de ce dépôt (colonne de droite sur GitHub, ou `…/pliage/releases`).
2. Dans la dernière version, touche le fichier `pliage-1.0.X.apk` pour le télécharger.
3. Ouvre le fichier téléchargé. Android demande d'autoriser l'installation depuis cette source : accepte, puis touche **Installer**.
4. Si Google Play Protect affiche un avertissement (« application inconnue »), choisis **Installer quand même**.

Les mises à jour s'installent par-dessus l'ancienne version, sans perdre les données : historique, dossier « Mes essentiels », signatures et réglages.

## Fonctionnalités

- **Organiser** : fusionner (PDF et images), découper (par plages, chaque page, toutes les N pages, par taille), réorganiser les pages (déplacer, pivoter, dupliquer, supprimer, ajouter une page blanche), pivoter, extraire, supprimer des pages.
- **Convertir** :
  - PDF ↔ Word ;
  - PDF → image (JPG, PNG, WebP) et image → PDF ;
  - PDF ↔ Excel ;
  - PDF → PowerPoint et PowerPoint → PDF (en ligne) ;
  - PDF ↔ EPUB ;
  - EPUB ↔ FB2 ;
  - formats Kindle MOBI et AZW3 (en ligne).
- **Compresser** : PDF (3 niveaux, Pliage garde l'original s'il ne peut pas faire mieux), images (qualité, taille, format, EXIF et GPS), vidéos (480p à 1080p, qualité, son), création et extraction d'archives ZIP.
- **Modifier** (éditeur façon Acrobat) :
  - annoter : surligner, souligner, barrer, stylo, formes, notes ;
  - texte et images : ajouter du texte, remplacer une ligne de texte (elle est recouverte puis réécrite dans la même police, la même taille, la même couleur et sur le même fond), insérer une image, masquer une zone, gomme ;
  - signer : signature et initiales tracées au doigt et enregistrées, date, coche ;
  - formulaires : remplir les champs du PDF, puis les aplatir si tu veux.
- **Fichiers** : historique de tout ce qui a été ouvert ou créé, filtres, recherche. En haut, le dossier personnel **Mes essentiels** se renomme et accepte des sous-dossiers à volonté. Tu peux y mettre n'importe quel fichier : Pliage en garde sa propre copie.
- **Ouvrir avec Pliage** et **Partager vers Pliage** depuis les autres applis, y compris pour plusieurs fichiers à la fois.
- **Widget 3×2** : logo, carte « Reprendre » (le dernier fichier) et quatre raccourcis. Pour changer le thème, les raccourcis ou masquer « Reprendre » : appui long sur le widget, puis **Paramètres**.
- Chaque fichier créé est copié dans **Téléchargements/Pliage**. Tu peux désactiver cette copie dans Réglages.
- Une petite animation de pliage s'affiche à l'ouverture.

## Conversion haute fidélité (en ligne)

Hors ligne, PDF → Word, Excel et PowerPoint donnent une mise en page simplifiée. Pour un rendu identique à l'original, et pour PowerPoint → PDF ou les formats Kindle, Pliage peut passer par un service en ligne avec ta propre clé gratuite :

- **ConvertAPI** : crée un compte sur https://www.convertapi.com, puis copie ta clé (« Secret » ou « API Token ») depuis ton tableau de bord.
- **CloudConvert** : crée un compte sur https://cloudconvert.com, puis va dans *Dashboard › API › API Keys*, crée une clé avec les droits `task.read` et `task.write`, et copie-la.

Dans Pliage : **Réglages › Conversion haute fidélité**. Choisis le service, colle la clé, touche **Enregistrer**, puis **Tester la connexion**. La clé est chiffrée sur le téléphone (Android Keystore) et n'est jamais réaffichée. Avant chaque envoi, Pliage te prévient que le fichier part vers un serveur externe. Tu peux couper cet avertissement dans les Réglages.

## Données

Tout reste sur le téléphone. **Réglages › Créer une sauvegarde** exporte un ZIP avec le dossier « Mes essentiels » (fichiers compris), les signatures et les réglages. Ce ZIP se réimporte sur un autre téléphone avec **Restaurer une sauvegarde**.

## Structure

- `www/` : l'application (HTML, CSS, JavaScript).
  - `js/app.js` : onglets, accueil, Fichiers, Mes essentiels, Réglages, écran de résultat, fichiers reçus, raccourcis du widget.
  - `js/tools.js` : les écrans des outils Organiser, Convertir et Compresser.
  - `js/pdfops.js` : opérations PDF (pdf-lib et pdf.js), compression des images internes, lecture du texte.
  - `js/convert.js` : conversions Word, Excel, PowerPoint, EPUB et FB2.
  - `js/editor.js` : l'éditeur PDF. `js/sig.js` : signatures.
  - `js/intro.js` : animation d'ouverture. `js/native.js` : pont vers Android, avec une version de secours pour tester dans un navigateur.
  - `lib/` : pdf-lib, fontkit, pdf.js, JSZip, pako, docx, mammoth, SheetJS, PptxGenJS, police Carlito. `fonts/` : Inter et Caveat.
- `android/` : projet Android généré par Capacitor.
  - `PliagePlugin.java` : fichiers, partage, Téléchargements, images, ZIP, HTML → PDF, clés chiffrées, conversion en ligne, sauvegarde.
  - `VideoCompressor.java` (Media3 Transformer), `HtmlToPdf.java` et `android/print/PdfPrinter.java` (PDF via la WebView), `OnlineConverter.java` (ConvertAPI, CloudConvert).
  - `PliageWidget.java`, `WidgetConfigActivity.java` et `res/layout/pliage_widget.xml` : le widget.
- `scripts/vendor.mjs` recopie les bibliothèques depuis `node_modules` (`npm run vendor`). `scripts/icons.mjs` génère les images de l'icône, puis `npx @capacitor/assets generate --android` produit les icônes Android.
- `.github/workflows/build.yml` compile l'APK signé et publie une Release à chaque envoi sur `main`.

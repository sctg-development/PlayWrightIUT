/**
 * QR code page generator for calendar access
 * Generates HTML page with QR code for calendar subscription
 */

import { QRCode_RT1_A1, QRCode_RT1_A2, QRCode_RT1_B1, QRCode_RT1_B2 } from './qrcodes/qrcodes';

/**
 * Generates QR code page HTML for a specific group
 * @param group - The group identifier (RT1_A1, RT1_A2, RT1_B1, RT1_B2)
 * @returns HTML string for the QR code page
 */
export function generateQRCodePage(group: string): string {
    // Validate group
    const validGroups = ['RT1_A1', 'RT1_A2', 'RT1_B1', 'RT1_B2'];
    if (!validGroups.includes(group)) {
        return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Groupe non valide - ADE IUT Béthune</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #00091B;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .error {
            color: #e74c3c;
            font-size: 18px;
            margin-bottom: 20px;
        }
        .back-link {
            display: inline-block;
            margin-top: 20px;
            padding: 10px 20px;
            background: #3498db;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            transition: background 0.3s ease;
        }
        .back-link:hover {
            background: #2980b9;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Erreur</h1>
        <p class="error">Le groupe '${group}' n'est pas valide.</p>
        <p>Groupes disponibles : RT1_A1, RT1_A2, RT1_B1, RT1_B2</p>
        <a href="/" class="back-link">Retour à l'accueil</a>
    </div>
</body>
</html>`;
    }

    // Get the appropriate QR code SVG
    let qrCodeSvg: string;
    let groupDisplayName: string;

    function generateGroupeDisplayName(group: string): string {
        let name = '';
        let parts = group.split('_');
        if (parts.length === 2) {
            name = `${parts[0]} - Groupe ${parts[1]}`;
        } else {
            name = group;
        }
        return name;
    }
    switch (group) {
        case 'RT1_A1':
            qrCodeSvg = QRCode_RT1_A1;
            groupDisplayName = generateGroupeDisplayName('RT1_A1');
            break;
        case 'RT1_A2':
            qrCodeSvg = QRCode_RT1_A2;
            groupDisplayName = generateGroupeDisplayName('RT1_A2');
            break;
        case 'RT1_B1':
            qrCodeSvg = QRCode_RT1_B1;
            groupDisplayName = generateGroupeDisplayName('RT1_B1');
            break;
        case 'RT1_B2':
            qrCodeSvg = QRCode_RT1_B2;
            groupDisplayName = generateGroupeDisplayName('RT1_B2');
            break;
        default:
            qrCodeSvg = '';
            groupDisplayName = group;
    }

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calendrier ${groupDisplayName} - ADE IUT Béthune Réseaux et télécoms</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
           background: #00091B;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .title {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 24px;
        }
        .subtitle {
            color: #7f8c8d;
            margin-bottom: 30px;
            font-size: 16px;
        }
        .qr-code {
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            display: inline-block;
        }
        .qr-code svg {
            width: 200px;
            height: 200px;
            max-width: 100%;
            height: auto;
        }
        .instructions {
            margin-top: 30px;
            padding: 20px;
            background: #ecf0f1;
            border-radius: 8px;
            text-align: left;
        }
        .instructions h3 {
            margin-top: 0;
            color: #2c3e50;
        }
        .instructions ol {
            margin: 10px 0 0 20px;
            padding: 0;
        }
        .instructions li {
            margin-bottom: 8px;
            color: #34495e;
        }
        .back-link {
            display: inline-block;
            margin-top: 30px;
            padding: 12px 24px;
            background: #00091B;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            transition: background 0.3s ease;
            font-weight: 500;
        }
        .back-link:hover {
            background: #2980b9;
        }
        .note {
            margin-top: 20px;
            font-size: 14px;
            color: #7f8c8d;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="title">Calendrier ${groupDisplayName}</h1>
        <p class="subtitle">IUT de Béthune - ADE</p>

        <div class="qr-code">
            ${qrCodeSvg}
        </div>

        <div class="instructions">
            <h3>Comment ajouter ce calendrier ?</h3>
            <ol>
                <li>Ouvrez l'application Calendrier sur votre téléphone</li>
                <li>Scannez le QR code ci-dessus avec l'appareil photo ou l'application d'appareil photo</li>
                <li>Suivez les instructions pour ajouter l'abonnement calendrier</li>
                <li>Le calendrier de votre groupe sera automatiquement synchronisé</li>
            </ol>
        </div>

        <p class="note">
            Le calendrier se met à jour automatiquement toutes les 12 heures.<br>
            En cas de problème, ne me contactez pas.<br>
            Ceci est gratuit et non officiel.
        </p>

        <a href="/" class="back-link">Retour à l'accueil</a>
    </div>
</body>
</html>`;
}
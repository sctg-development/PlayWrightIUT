/*
 * Copyright (c) 2025 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Renders the homepage HTML.
 * @param statsHtml - Prebuilt HTML fragment containing stats to be interpolated into the page
 * @returns Full HTML string for the homepage
 */
export function renderHome(statsHtml: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IUT Béthune - Réseaux et Télécoms</title>
    <style>
        body {
            background: #00091B;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: sans-serif;
            color: white;
            overflow: hidden;
        }
        #content {
            text-align: center;
            animation: descend 2s ease-out forwards;
            opacity: 0;
            transform: translateY(-100px);
        }
        @keyframes descend {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .main-text {
            font-size: 50px;
            margin: 0;
            line-height: 1.2;
        }
        .plus {
            color: #4febfe;
        }
        .stats {
            margin: 20px 0;
            font-size: 10px;
            opacity: 0.8;
        }
        .footer {
            font-size: 9px;
            margin: 20px 0 0 0;
        }
        a {
            color: white;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div id="content">
        <p class="main-text">IUT <span class="plus">+</span> Béthune</p>
        <p class="main-text">Réseaux et Télécoms</p>
        <div class="stats">${statsHtml}</div>
        <p class="footer"><a href="https://github.com/sctg-development/PlayWrightIUT">©2025 Ronan Le Meillat - SCTG Development</a></p>
    </div>
</body>
</html>`;
}

export default renderHome;

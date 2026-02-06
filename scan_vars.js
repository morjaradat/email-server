const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, 'templates');
const dataTemplatesDir = path.join(__dirname, 'data', 'email-templates');

const results = {};

function extractVariables(source) {
    const regex = /{{\s*#?\/?\s*([a-zA-Z0-9_.]+)(?:\s+[^}]*)?\s*}}/g;
    const vars = new Set();
    let match;
    while ((match = regex.exec(source)) !== null) {
        let varName = match[1];
        // Ignore keywords and partials
        if (varName.startsWith('>')) continue;
        if (varName === 'else') continue;
        if (varName === 'if') continue; // usually {{#if var}}, match[1] would be 'if'? No, {{#if var}} -> match[1] depends on regex.
        // Let's refine regex to handle {{#if name}} vs {{name}}
        // Handled by group 1 being just the first word? 
        // Let's use a simpler approach: splitting by {{ and }} and analyzing.
    }

    // Better Regex for handlebars variables
    // Matches {{ var }}, {{ object.prop }}, {{#if var}}, {{/if}} (ignored), {{> partial}} (ignored)
    const hbRegex = /{{(#?)(?:\s*)([a-zA-Z0-9_.]+)(?:\s*)([^}]*)}}/g;

    while ((match = hbRegex.exec(source)) !== null) {
        const isBlock = match[1] === '#';
        const name = match[2];
        const args = match[3];

        if (name === '>' || name.startsWith('>')) continue; // Partial
        if (name === 'if' || name === 'unless' || name === 'each' || name === 'with') {
            // For block helpers, the variable is often the first argument
            // e.g. {{#if variableName}}
            const argMatch = args.trim().split(/\s+/)[0];
            if (argMatch) vars.add(argMatch);
            continue;
        }
        if (name === 'else' || name.startsWith('/')) continue; // Closing or else

        vars.add(name);
    }
    return Array.from(vars).sort();
}

// Scan html templates
if (fs.existsSync(templatesDir)) {
    fs.readdirSync(templatesDir).forEach(file => {
        if (file.endsWith('.html')) {
            const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
            results[file.replace('.html', '')] = extractVariables(content);
        }
    });
}

// Scan js templates
if (fs.existsSync(dataTemplatesDir)) {
    fs.readdirSync(dataTemplatesDir).forEach(file => {
        if (file.endsWith('.js')) {
            const content = require(path.join(dataTemplatesDir, file));
            if (content.html) {
                results[file.replace('.js', '')] = extractVariables(content.html);
            }
        }
    });
}

console.log(JSON.stringify(results, null, 2));

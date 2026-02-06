const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, 'data', 'email-templates');

if (!fs.existsSync(templatesDir)) {
    console.error('Templates directory not found:', templatesDir);
    process.exit(1);
}

const formatTemplate = (content) => {
    // 1. Remove "export default variableName;"
    // 2. Add "module.exports = variableName;"
    // 3. Remove "html: " prefix inside backticks

    // Replace export default with module.exports
    // Handle optional semicolon at the end
    content = content.replace(/export\s+default\s+(\w+)\s*;?/, 'module.exports = $1;');

    // Remove html: prefix inside backticks (correctly this time)
    content = content.replace(/`\s*html:\s*/g, '`');

    // Fix HTML-encoded Handlebars syntax (e.g., {{&gt; app_logo}} -> {{> app_logo}})
    content = content.replace(/{{&gt;/g, '{{>');

    return content;
};

const convert = () => {
    const files = fs.readdirSync(templatesDir);

    files.forEach(file => {
        if (path.extname(file) === '.ts') {
            const filePath = path.join(templatesDir, file);
            const content = fs.readFileSync(filePath, 'utf8');

            const newContent = formatTemplate(content);
            const newFilePath = filePath.replace('.ts', '.js');

            fs.writeFileSync(newFilePath, newContent);
            console.log(`Converted: ${file} -> ${path.basename(newFilePath)}`);
        }
    });
};

convert();

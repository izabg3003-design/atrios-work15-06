import fs from 'fs';
const files = fs.readdirSync('./public');
files.forEach(file => {
  const stats = fs.statSync(`./public/${file}`);
  console.log(`${file}: ${stats.size} bytes`);
});

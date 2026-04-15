const { execSync } = require('child_process');

try {
  console.log('Pushing local fixes to GitHub so Railway can see them...');
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "Force fix dashboard ports"', { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log('\n\n✅ SUCCESS! The new code is on GitHub! Railway should start a new build now. Wait 2 minutes and check your website!');
} catch (e) {
  console.error('\n\n❌ ERROR PUSHING TO GITHUB! Please read the error above.');
}

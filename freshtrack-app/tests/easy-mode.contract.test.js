'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('easy mode browser script parses as valid JavaScript',()=>{
 assert.doesNotThrow(()=>new vm.Script(read('easy-mode.js'),{filename:'easy-mode.js'}));
});

test('easy mode assets are linked and included in the production build',()=>{
 const html=read('index.html'),build=read('build.js');
 assert.match(html,/href="\/easy-mode\.css"/);
 assert.match(html,/src="\/easy-mode\.js"/);
 assert.match(build,/'easy-mode\.js'/);
 assert.match(build,/'easy-mode\.css'/);
});

test('simple add flow offers one-tap categories and rice maps to grains',()=>{
 const js=read('easy-mode.js'),css=read('easy-mode.css');
 for(const key of ['rice','lentils','flour','oil','sugar','milk','vegetables','other'])assert.match(js,new RegExp('data-easy-item="'+key+'"'));
 assert.match(js,/rice:\{en:'Rice',hi:'चावल',category:'Grains',unit:'kg'/);
 assert.match(js,/ensureBatchCode\(\)/);
 assert.match(js,/received\.value=todayIndia\(\)/);
 assert.match(css,/\.easy-category-grid\{display:grid/);
 assert.match(css,/body\.simple-mode:not\(\.show-advanced\) \.easy-auto-field/);
});

test('personalization supports system, light and dark themes, Hindi/English and larger text',()=>{
 const js=read('easy-mode.js'),css=read('easy-mode.css');
 for(const text of ["theme:'system'","language:'hi'","fontSize:'large'","prefers-color-scheme: dark","pref-theme","pref-language","pref-textsize","easyAdvancedToggle"])assert.ok(js.includes(text),text);
 assert.match(css,/:root\[data-theme="dark"\]/);
 assert.match(css,/body\.large-text/);
 assert.match(css,/body\.simple-mode:not\(\.show-advanced\) #backup-restore/);
});

test('voice entry degrades safely and offers spoken help without hard dependencies',()=>{
 const js=read('easy-mode.js');
 assert.match(js,/window\.SpeechRecognition\|\|window\.webkitSpeechRecognition/);
 assert.match(js,/speechSynthesis\.speak/);
 assert.match(js,/Voice entry is not supported by this browser/);
 assert.match(js,/माइक्रोफ़ोन की अनुमति नहीं मिली/);
});

test('account deletion uses protected server action and typed confirmation; no admin key is in the browser',()=>{
 const js=read('easy-mode.js');
 assert.match(js,/functions\/v1\/delete-account/);
 assert.match(js,/Authorization:'Bearer '\+stored\.access_token/);
 assert.match(js,/confirmation:'DELETE'/);
 assert.match(js,/confirmInput\.value!=='DELETE'/);
 assert.doesNotMatch(js,/SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('Vercel permits only same-origin microphone use for voice controls',()=>{
 const config=JSON.parse(read('vercel.json'));
 const header=config.headers[0].headers.find(h=>h.key==='Permissions-Policy');
 assert.ok(header);
 assert.match(header.value,/microphone=\(self\)/);
 assert.match(header.value,/camera=\(\)/);
 assert.match(header.value,/geolocation=\(\)/);
});


test('Hindi localization includes rice category, pantry and everyday unit labels',()=>{
 const js=read('easy-mode.js');
 for(const pair of ["'Grains':'अनाज'","'Pantry':'राशन'","'Choose category':'श्रेणी चुनें'","'kg':'किलो (kg)'","'g':'ग्राम (g)'","'litre':'लीटर'","'ml':'मिलीलीटर'","'units':'पीस'","'packs':'पैकेट'","'boxes':'डिब्बे'"])assert.ok(js.includes(pair),pair);
});

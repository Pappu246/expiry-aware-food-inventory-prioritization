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
 for(const key of ['rice','lentils','flour','oil','sugar','salt','spices','milk','vegetables','other'])assert.match(js,new RegExp('data-easy-item="'+key+'"'));
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


test('backup and sign out are moved into the three-dot settings menu',()=>{
 const js=read('easy-mode.js'),html=read('index.html'),css=read('easy-mode.css');
 assert.match(html,/id="backupBtn"/);
 assert.match(html,/id="logout"/);
 assert.match(js,/const accountActions=document\.createElement\('div'\)/);
 assert.match(js,/for\(const id of \['backupBtn','logout'\]\)/);
 assert.match(js,/accountActions\.append\(button\)/);
 assert.match(js,/menuDivider\.insertAdjacentElement\('beforebegin',accountActions\)/);
 assert.match(css,/\.easy-account-actions\{display:grid/);
});

test('Hindi voice mode parses Hindi digits and quantities without silently classifying unknown items as Other',()=>{
 const js=read('easy-mode.js');
 assert.match(js,/recognition\.lang=prefs\.language==='hi'\?'hi-IN':'en-IN'/);
 assert.match(js,/replace\(\/\[०-९\]\/g/);
 assert.match(js,/salt:\{en:'Salt',hi:'नमक',category:'Pantry',unit:'kg'/);
 assert.match(js,/spices:\{en:'Spices',hi:'मसाले',category:'Pantry',unit:'packs'/);
 assert.match(js,/पच्चीस/);
 assert.match(js,/I could not identify the item/);
});


test('clear previous data UI requires explicit confirmation and calls the account-scoped RPC',()=>{
 const js=read('easy-mode.js');
 assert.match(js,/id="easyClearInventory"/);
 assert.match(js,/id="easyClearDataDialog"/);
 assert.match(js,/confirmInput\.value!=='CLEAR'/);
 assert.match(js,/freshtrack_clear_inventory/);
 assert.match(js,/p_confirmation:'CLEAR'/);
 assert.match(js,/stored\\?\.access_token|stored\\.access_token/);
 assert.match(js,/Download backup first/);
});

test('clear previous data is not account deletion and uses the signed-in session token',()=>{
 const js=read('easy-mode.js');
 const start=js.indexOf('async function clearInventoryData()');
 const end=js.indexOf('function dialogCloseSafe',start);
 const section=js.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(section,/stored\.access_token/);
 assert.match(section,/data\?\.cleared!==true/);
 assert.doesNotMatch(section,/auth\.admin\.deleteUser|delete-account/);
});


test('clear inventory database migration is strictly scoped to auth.uid and explicit confirmation',()=>{
 const migration=fs.readFileSync(path.resolve(root,'../supabase/migrations/20261013130000_add_user_scoped_inventory_clear.sql'),'utf8');
 assert.match(migration,/security definer/i);
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/p_confirmation is distinct from 'CLEAR'/);
 assert.match(migration,/delete from public\.freshtrack_movements where user_id = v_user_id/i);
 assert.match(migration,/delete from public\.freshtrack_batches where user_id = v_user_id/i);
 assert.match(migration,/delete from public\.freshtrack_backup_snapshots where user_id = v_user_id/i);
 assert.match(migration,/grant execute on function public\.freshtrack_clear_inventory\(text\) to authenticated/i);
 assert.doesNotMatch(migration,/delete from auth\.users/i);
});

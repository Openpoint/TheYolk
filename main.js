'use strict'

if(require('electron-squirrel-startup')) return;

const fs=require('fs');
const path=require('path');

/*
var str = JSON.stringify(process,function(key,value){
	console.log(key);
	if( key == 'parent'||key == 'owner') { return value.id;}
	else {return value;}
}, 4);
console.log(str)
var str = JSON.stringify(process.mainModule.filename,function(key,value){
	if( key == 'owner') { return value.id;}
	else {return value;}
}, 4);
console.log(path.dirname(str));

return;
*/
const bootloader = require('./core/lib/bootloader.js');
const boot = new bootloader();

const {app, BrowserWindow, webContents, ipcMain} = require('electron');
const child = require('child_process');

const ft = require('./core/lib/filetools.js');
const Installer = require('./core/lib/installer.js');
var installer = false;
var installed = false;

const os = require('os');

const elasticversion = '5.0.1';
const javaversion = 'jre1.8.0_111';
const javahome = path.join(boot.home,'.bin',javaversion);
if(os.platform()!=='win32'){
	var elasticpath = path.join(boot.home,'.bin','elasticsearch-'+elasticversion,'bin','elasticsearch');
}else{
	var elasticpath = path.join(boot.home,'.bin','elasticsearch-'+elasticversion,'bin','elasticsearch.bat');
}


var tokill=[];
var dbaseReady = false;
var clientReady = false;
//console.log(boot.modules)

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
	// Create the browser window.
	win = new BrowserWindow({width: 1200, height: 900, frame: false});

	//win.webContents.openDevTools();

	// and load the index.html of the app.
	win.loadURL(`file://${__dirname}/index.html`);






	// Emitted when the window is closed.
	win.on('closed', () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.

		win = null;
		if(os.platform()!=='win32'){
			elasticsearch.stdin.pause();
			elasticsearch.kill();
		}else{
			//console.log('Shutting Down');
			var shut=child.execSync('wmic process get Caption,ParentProcessId,ProcessId');

			var toKill=[];
			var stdout=shut.toString('utf8').split('\n');
			stdout.forEach(function(line){
				line = line.trim().replace(/\/r/g,'').split('  ');
				var Line = [];
				line.forEach(function(item){
					if(item.trim().length > 0){
						Line.push(item.trim());
					}
				});
				toKill.push(Line);
			});

			toKill.forEach(function(line){
				if(line[1]==elasticsearch.pid||line[2]==elasticsearch.pid){
					tokill.push({
						process:line[0],
						pid:line[2]*1
					});
				}
			});
			var java;
			tokill.forEach(function(task){
				if(task.process === 'java.exe'){
					java = task.pid;
				}else{
					process.kill(task.pid);
					//console.log(task.process);
				}
			});
			if(java){
				//console.log('killing java');
				process.kill(java);
			}


		}
	})
}



// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
	app.quit()
  }
})

app.on('activate', function() {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
	createWindow()

  }
})
ipcMain.on('dbasestate', function(event, data) {
	event.sender.send('dbasestate',dbaseReady);
})
ipcMain.on('track_relay', function(event, data) {
	event.sender.send('track',data);
})
ipcMain.on('ready', function(event, data) {
	event.sender.send('config',boot);
	if(!installer){
		installer = new Installer(boot,win.webContents);
		install();
	}
})
ipcMain.on('tools', function(event, data) {
	// Open the DevTools.
	win.webContents.openDevTools();
})
ipcMain.on('chrome', function(event, data) {
	switch (data){
		case 'close':
			win.close();
		break;
		case 'min':
			win.minimize();
		break;
		case 'max':
			if(win.isFullScreen()){
				win.setFullScreen(false);
				if(win.isMaximized()){
					win.unmaximize();
				}
			}else{
				win.setFullScreen(true)
			}

		break;
	}
})
ipcMain.on('install', function(event, data) {
	if(data === 'ready'){
		clientReady = true;
	}
})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

var getJava = function(){
	installer.getJava().then(function(home){
		hasElastic(javahome);
	},function(){
		console.log('Getting Java failed');
	});
}
var hasElastic = function(home){

	installer.hasElastic(elasticpath).then(function(res){
		if(res){
			//console.log('Elasticsearch is installed');
			elastic(home);
		}else{
			//console.log('Getting Elasticsearch');
			installer.getElastic(elasticversion).then(function(){
				elastic(home);
			});
		}
	});
}
function install(){
	installer.hasJava().then(function(res){
		//console.log('Java installed');
		hasElastic();
	},function(res){
		//console.log('Java not installed');
		if(!res){
			installer.hasJava(javahome).then(function(res){
				//console.log('Java installed');
				hasElastic(javahome);
			},function(){
				getJava();
			});
		}else{
			getJava();
		}
	});
}
function clientBoot(){
	win.webContents.send('install',{
		type:'done'
	});
	setTimeout(function(){
		if(!clientReady){
			clientBoot();
		}
	},100);
}
//Start the elasticsearch server
var elasticsearch;
function elastic(home){
	if(home){
		process.env.JAVA_HOME = home;
	}
	installed = true;
	clientBoot();
	var args = [
		'-Epath.conf='+path.join(boot.home,'elasticsearch','config'),
		'-Epath.data='+path.join(boot.home,'elasticsearch','data'),
		'-Epath.logs='+path.join(boot.home,'elasticsearch','logs')
	];


	if(os.platform()!=='win32'){
		elasticsearch = child.spawn(elasticpath,args);

	}else{
		elasticsearch = child.spawn(elasticpath,args,{shell:true});
	}

	elasticsearch.stdout.on('data', function(data){
		var string = (`${data}`);
		var trimmed = string.split('[yolk]')[1];
		//console.log(string);
		if(win && trimmed){
			win.webContents.send('install',{
				type:'progress',
				percent:false,
				log:trimmed.replace(/\/n/g,'').trim()
			});
		}
		if(string.indexOf('[GREEN]') > -1 || string.indexOf('[yolk] recovered [0] indices into cluster_state') > -1){
		//if(string.indexOf('[yolk] started') > -1){
			dbaseReady = true;
		}
	});
}


boot.coreProcesses.forEach(function(file){
	require(file);
})

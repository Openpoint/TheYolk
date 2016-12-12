'use strict'

//if(require('electron-squirrel-startup')) return;
process.Yolk = {};

const {app, BrowserWindow, webContents, ipcMain} = require('electron');
const fs=require('fs');
const path=require('path');
const Elastic = require('elasticsearch');
const child = require('child_process');
const os = require('os');
const promise = require('promise');
const Installer = require('./core/lib/installer.js');
const bootloader = require('./core/lib/bootloader.js');
const ft = require('./core/lib/filetools.js');
const boot = new bootloader();

const elasticversion = '5.0.1';
const javaversion = 'jre1.8.0_111';
var installer;


process.Yolk.resolver = {};
process.Yolk.remote = function(val){
	return process.Yolk[val];
}
process.Yolk.root = boot.root;
process.Yolk.home = boot.home;
process.Yolk.message = false;
process.Yolk.clientReady = function(){
	installer = new Installer();
	install();
	return boot.modules;
}
process.Yolk.dbReady = new promise(function(resolve,reject){
	process.Yolk.resolver.dbReady = function(){
		resolve();
	}
});
process.Yolk.chrome = function(action){
	switch (action){
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
		case 'devtools':
			win.webContents.openDevTools();
		break;
	}
}

//Create the main browser window
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

function createWindow () {
	win = new BrowserWindow({width: 1200, height: 900, frame: false});
	win.loadURL(`file://${__dirname}/index.html`);
	process.Yolk.win = win;
	process.Yolk.message = win.webContents;
	win.webContents.openDevTools();

	// Emitted when the window is closed.
	win.on('closed', () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.

		win = null;
		if(os.platform()!=='win32'){
			if(process.Yolk.elasticsearch){
				process.Yolk.elasticsearch.stdin.pause();
				process.Yolk.elasticsearch.kill();
			}

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
				if(line[1]== process.Yolk.elasticsearch.pid||line[2]== process.Yolk.elasticsearch.pid){
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
app.on('ready', function(){
	createWindow();
	process.Yolk.javahome = path.join(boot.home,'.bin',javaversion);
	if(os.platform()!=='win32'){
		process.Yolk.elasticpath = path.join(boot.home,'.bin','elasticsearch-'+elasticversion,'bin','elasticsearch');
	}else{
		process.Yolk.elasticpath = path.join(boot.home,'.bin','elasticsearch-'+elasticversion,'bin','elasticsearch.bat');
	}
	boot.coreProcesses.forEach(function(file){
		require(file);
	})
})

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

ipcMain.on('track_relay', function(event, data) {
	event.sender.send('track',data);
})


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

var getJava = function(){
	installer.getJava().then(function(home){
		hasElastic(process.Yolk.javahome);
	},function(){
		console.log('Getting Java failed');
	});
}
var hasElastic = function(home){

	installer.hasElastic(process.Yolk.elasticpath).then(function(res){
		if(res){
			//console.log('Elasticsearch is installed');
			elastic(home);
		}else{
			console.log('Getting Elasticsearch');
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
			installer.hasJava(process.Yolk.javahome).then(function(res){
				//console.log('Java installed');
				hasElastic(process.Yolk.javahome);
			},function(){
				getJava();
			});
		}else{
			getJava();
		}
	});
}

//Start the elasticsearch server

function elastic(home){
	if(home){
		process.env.JAVA_HOME = home;
	}
	var args = [
		'-Epath.conf='+path.join(boot.home,'elasticsearch','config'),
		'-Epath.data='+path.join(boot.home,'elasticsearch','data'),
		'-Epath.logs='+path.join(boot.home,'elasticsearch','logs')
	];


	if(os.platform()!=='win32'){
		process.Yolk.elasticsearch = child.spawn(process.Yolk.elasticpath,args);

	}else{
		process.Yolk.elasticsearch = child.spawn(process.Yolk.elasticpath,args,{shell:true});
	}

	process.Yolk.elasticsearch.stdout.on('data', function(data){
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
			process.Yolk.resolver.dbReady();
		}
	});
}

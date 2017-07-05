"use strict"
window.Promise  = require("bluebird");
window.Promise.config({cancellation: true})
window.$ = window.jQuery = require('jquery');
const Yolk = {};
Yolk.remote = require('electron').remote.process.Yolk.remote;
Yolk.modules = Yolk.remote('modules');

const {ipcRenderer} = require('electron');
const path = require('path');
const utils = require('./core/lib/utils.js');


$(window).ready(function(){
	Yolk.remote('clientReady')();

	require('angular');
	require('angular-route');
	require('angular-animate');
	require('./core/routing.js');
	require('angular-drag-drop');

	for(var key in Yolk.modules){
		var module = Yolk.modules[key];
		//load the controllers
		if(module.controller){
			require(module.controller)
		}

		//load the support files
		['services','filters','directives'].forEach(function(type){
			if(module[type] && module[type].length){
				module[type].forEach(function(service){
					try{
						require(service)
					}
					catch(error){
						console.error(service+'\n', error)
					}
				})
			}
		})
	}
	setTimeout(function(){
		ipcRenderer.send('domReady');
	})
})

ipcRenderer.on('log',function(event,data){
	if(data.log) console.log(data.log);
	if(data.error) console.error(data.error);
	if(data.warn) console.warn(data.warn);
	if(data.json){
		data = JSON.parse(data.json);
		console.log(data.json);
	}
})


Yolk.home = Yolk.remote('home');
Yolk.root = Yolk.remote('root');

Yolk.fixChrome = function(){
	$('body').hide();

	$('#chrome').clone().removeAttr('id').addClass('Chrome').appendTo('#topmen').attr('height','100%');
	$('#topmen').height($('.Chrome').height())
}
Yolk.getModule=function(){
	var modname = window.location.hash.split('/')[1];
	modname = modname.split('?')[0];
	var head  = document.getElementsByTagName('head')[0];
	$('head [id^=inject]').remove();

	if(!modname){
		modname = 'boot'
	}

	var module = Yolk.modules[modname];
	var links = [];
	if(module.css && module.css.length){
		var count = 0;
		module.css.forEach(function(css){
			var link  = document.createElement('link');
			link.rel  = 'stylesheet';
			link.type = 'text/css';
			link.media = 'all';
			link.href = css;
			link.id='inject'+count;
			count++;
			links.push(link);
		})
	}
	setTimeout(function(){
		if(links.length){
			links.forEach(function(link){
				head.appendChild(link);
			})
		}
		$(window).ready(function(){
			$('body').show();
		})
	})

	Yolk.remote('coreprocess')(modname);
}

Yolk.prepare=function($scope,mod_name){
	if(Yolk.modules[mod_name].config.db_index && Yolk.modules[mod_name].config.db_index.index) $scope.db_index = Yolk.modules[mod_name].config.db_index.index;
	process.env.ELECTRON_ENV === 'development'?$scope.isdev = true:$scope.isdev = false;
	$scope.root = Yolk.root;
	$scope.icon = path.join($scope.root,'/core/lib/css/icons/yolk.svg');
	$scope.ft = require(path.join(Yolk.root,'core/lib/filetools.js'));
	$scope.db = require(path.join(Yolk.root,'core/lib/elasticsearch.js'));
	$scope.utils = new utils();
	if(mod_name === 'boot') return;

	$scope.$watch('settings',function(newVal,oldVal){
		if(oldVal && newVal!==oldVal){
			$scope.db.update({
				index:'global',
				type:'settings',
				id:mod_name,
				body:{doc:newVal}
			}).then(function(data){
				//console.log(data)
			},function(err){
				console.error(err)
			})
		}

	},true);
	return new Promise(function(resolve,reject){
		$scope.db.client.get({index:'global',type:'settings',id:mod_name},function(err,data){
			$scope.$apply(function(){
				$scope.settings = data._source;
				resolve(true);
			})
		})
	})
}

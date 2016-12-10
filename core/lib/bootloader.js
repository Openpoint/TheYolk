'use strict'

const fs=require('fs');
const path=require('path');
const ft=require('./filetools');
const q = require('promise');
const os = require('os');

var getModule = function(module){
	//console.log(module);
}
var checkEnd = function(end,file){
	return file.indexOf(end, file.length - end.length) !== -1;
}


var bootloader = function(){
	//this.root = process.cwd();
	this.root = process.cwd();
	this.home = path.join(os.homedir(),'.yolk');
	this.modules={};
	this.coreProcesses=[];
	this.modulePaths=[
		{
			path:"core/modules",
			type:'core'
		},
		{
			path:"contrib/modules",
			type:'contrib'
		}
	];
	this.makeHome(['elasticsearch/config/scripts','elasticsearch/data','elasticsearch/logs','.temp','.bin','data/modules']);
	this.getmodules();
}

bootloader.prototype.makeHome = function(dirs){
	var self = this;
	if(!ft.isThere('dir',this.home)){
		fs.mkdirSync(this.home);
	}
	var target;
	dirs.forEach(function(Path){
		ft.mkdir(self.home,Path);
		/*
		target = self.home;
		Path = Path.split('/');
		Path.forEach(function(dir){
			target = path.join(target,dir);
			if(!ft.isThere('dir',target)){
				fs.mkdirSync(target);
			}
		});
		* */
	});
	var links = ['elasticsearch.yml','jvm.options','log4j2.properties'];
	links.forEach(function(link){
		if(link.split('.').length > 0){
			var type = 'file';
		}else{
			var type = 'dir'
		}
		var src = path.join(self.root,'core','lib','elasticsearch',link);
		var target = path.join(self.home,'elasticsearch','config',link);
		//fs.symlink(src,target,function(){});
		ft.copy(src,target).then(function(data){
			//console.log(data);
		});
	});

}

//scan filesystem for modules
bootloader.prototype.getmodules = function(){
	var self = this;
	this.modulePaths.forEach(function(p){
		var pt = path.join(self.root,p.path);
		fs.readdirSync(pt).forEach(function(mod){
			pt = path.join(self.root,p.path,mod);
			if(ft.isThere('dir',pt)){
				self.modules[mod]={
					name:mod,
					path:pt,
					type:p.type
				};
			};
		});

	})
	this.getConfig();
}

//load config files for each module
bootloader.prototype.getConfig = function(){
	var self = this;
	for(var key in this.modules){
		var module = this.modules[key];
		var file = path.join(module.path,module.name+'.js');
		if(ft.isThere('file',file)){
			self.modules[key].config = require(file);
			self.configs(self.modules[key]);
		}else{
			delete self.modules[key];
		}
	}
}

//process each module cofiguration to single object
bootloader.prototype.configs  = function(module){
	var self  = this;
	if(module.config.core_process){
		module.config.core_process.forEach(function(process){
			var cp = path.join(module.path,'lib','process',process+'.js');

			if(ft.isThere('file',cp)){
				self.coreProcesses.push(cp);
			}
		});
	}
	if(!module.extends){

		//get the Angular controller
		var file = path.join(module.path,'angular',module.name+'_controller.js');
		if(ft.isThere('file',file)){
			module.controller = file;
		}else{
			//todo: error logging system
		}

		//get the angular html template
		file = path.join(module.path,module.name+'.html');
		if(ft.isThere('file',file)){
			module.html = file;
		}else{
			//todo: error logging system
		}
		var load = [module.path];
		if (module.require && module.require.length){
			module.require.forEach(function(mod){
				if(ft.isThere('dir',mod.path)){
					load.push(mod.path);
				}else{
					//todo: error logging system
				}

			});
		}
		load.forEach(function(pt){
			//get the angular services
			file = path.join(pt,'angular','services')

			if(ft.isThere('dir',file)){
				var services = fs.readdirSync(file);
				services.forEach(function(fil){
					if(ft.isThere('file',path.join(file,fil)) && checkEnd('_service.js',fil)){
						if(!module.services){
							module.services = [];
						}
						module.services.push(path.join(file,fil));
					}
				});
			}
			//get the angular filters
			file = path.join(pt,'angular','filters')

			if(ft.isThere('dir',file)){
				var filters = fs.readdirSync(file);
				filters.forEach(function(fil){
					if(ft.isThere('file',path.join(file,fil)) && checkEnd('_filter.js',fil)){
						if(!module.filters){
							module.filters = [];
						}
						module.filters.push(path.join(file,fil));
					}
				});
			}
		});

		//get the css
		file = path.join(module.path,'css')
		var parse = function(file){
			if(ft.isThere('dir',file)){
				var css = fs.readdirSync(file);
				css.forEach(function(fil){
					if(ft.isThere('file',path.join(file,fil)) && checkEnd('.css',fil)){
						if(!module.css){
							module.css = [];
						}
						module.css.push(path.join(file,fil));
					}
					if(ft.isThere('dir',path.join(file,fil))){
						parse(path.join(file,fil));
					}
				});
			}
		}
		parse(file);

		//create data directories
		if(module.config.data){
			Object.keys(module.config.data).forEach(function(key){
				var location = path.join('data/modules',module.name,module.config.data[key])
				if(!ft.isThere('dir',path.join(self.home,location))){
					ft.mkdir(self.home,location)
				}
			})
		}
	}else{
		var attach = getModule(module.extends);
	}
}
module.exports = bootloader;

"use strict";

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

const q = require("bluebird");
const fs=require('fs');
const path=require('path');
const ft=require('./filetools');
const child = require('child_process');
const os = require('os');

var message = function(type,message){
	if(process.Yolk.message){
		process.Yolk.message.send(type,message);
	}
}

var installer = function(){
	this.home = process.Yolk.home;
};

installer.prototype.hasJava=function(Path){
	var self = this;
	var promise = new Promise(function(resolve,reject){
		var jpath = path.join(Path,'bin','java');
		/*
		if(os.platform()==='darwin') {
			resolve(true);
			return;
		}else{
			var jpath = path.join(Path,'bin','java');
		}
		*/
		/*
		if(Path){
			var jpath = path.join(Path,'bin','java');
		}else{
			var jpath = 'java';
		}
		*/
		var jre = child.spawnSync(jpath, ['-version']);
		if(jre.error){
			process.Yolk.storedMesssage.log='No Local Java Installed';
			message('install',process.Yolk.storedMesssage);
			reject(true);
			/*
			if(Path){
				process.Yolk.storedMesssage.log='No Local Java Installed';
				message('install',process.Yolk.storedMesssage);
				reject(true);
			}else{
				process.Yolk.storedMesssage.log='No System Java Installed';
				message('install',process.Yolk.storedMesssage);
				reject(false);
			}
			*/
		}else{
			var data = jre.stderr.toString('utf8').split('\n')[0].split(' ');
			var version=data[data.length-1].replace(/"/g,'').split('.');
			if(version[0]==1 && version[1]>=8){
				resolve(true);
			}else{
				process.Yolk.storedMesssage.log='Java too old';
				message('install',process.Yolk.storedMesssage);
				reject(true);
			}
		}
	});
	return promise;
}
installer.prototype.getJava = function(){
	var self = this;
	var promise = new Promise(function(resolve,reject){

		process.Yolk.storedMesssage.message='Getting Java';
		message('install',process.Yolk.storedMesssage);

		var versions = {
			linuxx64:{
				url:"http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jre-8u131-linux-x64.tar.gz",
				checksum:"md5:9864b3b90840a2bc4604fba513e87453",
				cookie:'oraclelicense=accept-securebackup-cookie'
			},
			linuxia32:{
				url:"http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jre-8u131-linux-i586.tar.gz",
				checksum:"md5:c88bb459288ee336a0f6109be169bc8c",
				cookie:'oraclelicense=accept-securebackup-cookie'
			},
			win32x64:{
				url:"http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jre-8u131-windows-x64.tar.gz",
				checksum:"md5:75933fa1298ab1ccc25cb1e303db7372",
				cookie:'oraclelicense=accept-securebackup-cookie'
			},
			win32ia32:{
				url:"http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jre-8u131-windows-x64.tar.gz",
				checksum:"md5:75933fa1298ab1ccc25cb1e303db7372",
				cookie:'oraclelicense=accept-securebackup-cookie'
				//drop 32bit windows support due to https://github.com/nodejs/node-v0.x-archive/issues/2862
				/*
				url:"http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jre-8u131-windows-i586.tar.gz",
				checksum:"md5:116a59cb5c1165016c01551332c02006",
				cookie:'oraclelicense=accept-securebackup-cookie'
				*/
			},
			darwinx64:{
				url:"http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jre-8u131-macosx-x64.tar.gz",
				checksum:"md5:d80cdba2836949472d509d76a82e7d6b",
				cookie:'oraclelicense=accept-securebackup-cookie'
			}
		}
		var version = os.platform()+os.arch()

		var paths = [versions[version]];
		var filename = path.basename(versions[version].url);
		var target = path.join(self.home,'.temp',filename);


		function download(type){
			ft.download(paths,path.join(self.home,'.temp')).then(function(errors){
				if(errors.length){
					reject(errors);
				}else{
					process.Yolk.storedMesssage.log='got java';
					message('install',process.Yolk.storedMesssage);
					extract();
				}
			});
		};

		function extract(){
			ft.extract(target,path.join(self.home,'.bin'),'tar.gz').then(function(){
				process.Yolk.storedMesssage.log='extracted: '+target;
				message('install',process.Yolk.storedMesssage);
				resolve();
			},function(err){
				process.Yolk.storedMesssage.log=err;
				message('install',process.Yolk.storedMesssage);
				reject(err);
			});
		}


		if(ft.isThere('file',target)){
			ft.checksum(target,paths[0].checksum).then(function(){
				extract()
			},function(){
				fs.unlinkSync(target);
				process.Yolk.storedMesssage.log='Download was corrupt, trying again';
				message('install',process.Yolk.storedMesssage);
				download('java');
			});
		}else{
			download('java');
		}
	})
	return promise;
}

installer.prototype.hasElastic=function(Path){

	var promise = new Promise(function(resolve,reject){
		console.log(Path)
		if(!ft.isThere('file',Path)){
			resolve(false);
		}else{
			resolve(true);
		}
		/*
		var elastic = child.spawnSync(Path,['-V']);
		if(elastic.error){
			resolve(false);
		}else{
			resolve(true);
		}
		*/
	})
	return promise;
}
installer.prototype.getElastic = function(elasticversion,hash){
	var self = this;
	var promise = new Promise(function(resolve,reject){

		process.Yolk.storedMesssage = {
			message:'Getting Elastic'
		}

		message('install',process.Yolk.storedMesssage);
		var filename = 'elasticsearch-'+elasticversion+'.tar.gz';
		var target = path.join(self.home,'.temp',filename);

		var paths = [
			{
				url:'https://artifacts.elastic.co/downloads/elasticsearch/'+filename,
				checksum:hash
			},
		];

		function extract(){

			ft.extract(target,path.join(self.home,'.bin'),'tar.gz').then(function(){
				message('log','finished extraction');
				resolve();
			},function(err){
				reject(err);
			});
		};
		function download(){
			ft.download(paths,path.join(self.home,'.temp'),self.win).then(function(errors){
				if(errors.length){
					reject(errors);
				}else{
					process.Yolk.storedMesssage.log='got elastic';
					message('install',process.Yolk.storedMesssage);
					ft.checksum(target,paths[0].checksum).then(function(){
						extract()
					},function(){
						fs.unlinkSync(target);
						process.Yolk.storedMesssage.log='Download was corrupt, trying again';
						message('install',process.Yolk.storedMesssage);
						download();
					});
				}
			});
		};
		if(ft.isThere('file',target)){
			ft.checksum(target,paths[0].checksum).then(function(){
				extract()
			},function(){
				fs.unlinkSync(target);
				process.Yolk.storedMesssage.log='Download was corrupt, trying again';
				message('install',process.Yolk.storedMesssage);
				download();
			});
		}else{
			download();
		}
	});
	return promise;
}

module.exports = installer;

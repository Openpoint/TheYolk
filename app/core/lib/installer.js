"use strict";

const q = require("bluebird");
const fs=require('fs');
const path=require('path');
const ft=require('./filetools');
const child = require('child_process');
const os = require('os');
var message = process.Yolk.message
function getMessage(){
	return process.Yolk.message;
}
var installer = function(){
	this.home = process.Yolk.home;
	message = process.Yolk.message;
};

installer.prototype.hasJava=function(Path){
	var self = this;
	var promise = new Promise(function(resolve,reject){
		if(Path){
			var jpath = path.join(Path,'bin','java');
		}else{
			var jpath = 'java';
		}

		var jre = child.spawnSync(jpath, ['-version']);
		if(jre.error){
			if(Path){
				message.send('log','No Local Java Installed');
				reject(true);
			}else{
				message.send('log','No System Java Installed');
				reject(false);
			}
		}else{
			var data = jre.stderr.toString('utf8').split('\n')[0].split(' ');
			var version=data[data.length-1].replace(/"/g,'').split('.');
			if(version[0]==1 && version[1]>=8){
				resolve(true);
			}else{
				message.send('log','System Java too old');
				reject(false);
			}
		}
	});
	return promise;
}
installer.prototype.getJava = function(){
	var self = this;
	var promise = new Promise(function(resolve,reject){
		process.Yolk.storedMesssage = {
			message:'Getting Java'
		}
		message = getMessage();
		message.send('install',process.Yolk.storedMesssage);
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
				url:"http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jre-8u131-windows-i586.tar.gz",
				checksum:"md5:116a59cb5c1165016c01551332c02006",
				cookie:'oraclelicense=accept-securebackup-cookie'
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


		function download(){
			ft.download(paths,path.join(self.home,'.temp'),self.win).then(function(errors){
				if(errors){
					message.send('log','error fetching java');
					message.send('error',errors);
				}else{
					message.send('install','got java');
					extract();

				}
			});
		};
		function extract(){

			ft.extract(target,path.join(self.home,'.bin'),'tar.gz').then(function(){
				message.send('install','extracted: '+target);
				resolve();
			},function(err){
				message.send('install',err);
				reject(err);
			});
		}
		if(ft.isThere('file',target)){
			ft.checksum(target,paths[0].checksum).then(function(){
				extract()
			},function(){
				fs.unlinkSync(target);
				download();
			});
		}else{
			download();
		}
	})
	return promise;
}

installer.prototype.hasElastic=function(Path){

	var promise = new Promise(function(resolve,reject){
		var elastic = child.spawnSync(Path,['-V']);
		if(elastic.error){
			resolve(false);
		}else{
			resolve(true);
		}
	})

	return promise;
}
installer.prototype.getElastic = function(elasticversion,hash){
	var self = this;
	var promise = new Promise(function(resolve,reject){

		process.Yolk.storedMesssage = {
			message:'Getting Elastic'
		}
		message = getMessage();
		message.send('install',process.Yolk.storedMesssage);
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
				message.send('log','finished extraction');
				resolve();
			},function(err){
				reject(err);
			});
		};
		function download(){
			ft.download(paths,path.join(self.home,'.temp'),self.win).then(function(errors){
				if(errors){
					message.send('error','error fetching elastic');
					reject(errors);
				}else{
					message.send('log','got elastic');
					extract();

				}
			});
		};
		if(ft.isThere('file',target)){
			ft.checksum(target,paths[0].checksum).then(function(){
				extract()
			},function(){
				fs.unlinkSync(target);
				download();
			});
		}else{
			download();
		}
	});
	return promise;
}

module.exports = installer;

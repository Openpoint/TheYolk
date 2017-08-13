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

const https = require('http');
const URL = require('url');
const fs=require('fs');
const path=require('path');
var q = require("bluebird");
var request = require('request');

const os = require("os");
var message = function(type,message){
	if(process.Yolk.message){
		process.Yolk.message.send(type,message);
	}
}

var filetools = function(){};

filetools.prototype.download = function(urls,destination){
	var self = this;

	var promise = new Promise(function(resolve,reject){
		var prom = {
			count:0,
			error:false,
			urls:urls,
			destination:destination
		}

		function done(file,err){
			if(file){
				if(!prom.error){
					prom.error=[];
				}
				prom.error.push(err);
				if(self.isThere('file',file)){
					fs.unlinkSync(file);
				}
			}
			prom.count ++;
			if(prom.count === prom.urls.length){
				resolve(prom.error);
			}
		};

		prom.urls.forEach(function(src){
			var url = URL.parse(src.url);
			var filename = url.pathname.split('/').pop();
			var file = path.join(prom.destination,filename);
			var size;
			var prog = 0;
			if(!self.isThere('file',file)){
				//var agent = new https.Agent(agentOptions);
				var options = {
					uri:url.href,
					headers: {
						Cookie:src.cookie
					}
				}
				var req = request.get(options).on('response',function(res){

					size = res.headers['content-length'];


					if(res.statusCode == 200){
						var File = fs.createWriteStream(file);
						res.on('data', function(data){

							File.write(data);
							prog = prog+data.byteLength;
							process.Yolk.storedMesssage.log = false;
							process.Yolk.storedMesssage.message = 'Downloading '+filename;
							process.Yolk.storedMesssage.percent = Math.round((prog/size)*100);
							message('install',process.Yolk.storedMesssage);
						}).on('end', function() {

							File.end();
							done();
						});
					}else{
						done(file,"statuscode: "+res.statusCode);
					}
				}).on('error',function(e){
					done(file,e.message);
				});
			}else{
				done();
			}
		});
	});

	return promise;
}
filetools.prototype.isThere = function(type,path){
	try {
		var there = fs.statSync(path);
		if(type.toLowerCase() === 'dir'){
			if(there.isDirectory()){
				return true;
			}else{
				return false;
			}
		}
		if(type.toLowerCase() === 'file'){
			if(there.isFile()){
				return true;
			}else{
				return false;
			}
		}
	}
	catch(err) {
		return false;
	}
}
filetools.prototype.extract = function(src,dest,type){
	var self = this;
	var promise = new Promise(function(resolve,reject){
		var destination = dest;
		process.Yolk.storedMesssage = {
			percent:'',
			message:'Extracting '+path.basename(src)
		}
		message('install',process.Yolk.storedMesssage);
		if(type==='tar.gz'){
			const targz = require('tar.gz');

			var parse = targz().createParseStream();

			parse.on('entry', function(entry){
				var p = path.join(destination,entry.path);
				if(entry.type==='Directory'){
					if(!self.isThere('directory',p)) self.mkdir(destination,entry.path);
				}else{
					if(self.isThere('file',p)) fs.unlinkSync(p);
					var options = {mode:entry.props.mode};
					var File = fs.createWriteStream(p,options);
					entry.pipe(File);

				}
			});
			parse.on('end',function(){
				fs.unlinkSync(src);
				resolve(true);
			});
			fs.createReadStream(src).pipe(parse);
		}
		if(type==='zip'){
			const yauzl = require("yauzl");
			yauzl.open(src, {lazyEntries: true}, function(err, zipfile) {
				if (err){
					throw err;
				}
				zipfile.readEntry();
				zipfile.on("entry", function(entry) {
					var p = path.join(destination,entry.fileName);
					if (/\/$/.test(entry.fileName)) {
						// directory file names end with '/'
						if(!self.isThere('directory',p)) self.mkdir(destination,entry.fileName);
						zipfile.readEntry();
					} else {
						if(self.isThere('file',p)) fs.unlinkSync(p);
						zipfile.openReadStream(entry, function(err, readStream) {
							if(err){
								throw err;
							}
							// ensure parent directory exists

							//self.mkdir(dest,path.dirname(entry.fileName));

							readStream.pipe(fs.createWriteStream(p));
							readStream.on("end", function() {
								zipfile.readEntry();
							});
						});
					}
				})
				zipfile.on("end",function(){
					fs.unlinkSync(src);
					resolve(true);
				})
		})
		}

	});
	return promise;
}
filetools.prototype.mkdir = function(base,Path){
	var self = this;
	var target = base;
	Path = Path.split('/');
	Path.forEach(function(dir){
		target = path.join(target,dir);
		if(!self.isThere('dir',target)){
			fs.mkdirSync(target);
		}
	});
}
filetools.prototype.copy = function(src,dest){
	var promise = new Promise(function(resolve,reject){
		var rd = fs.createReadStream(src);
		rd.on("error", function(err) {
			reject(err);
		});
		var wr = fs.createWriteStream(dest);
		wr.on("error", function(err) {
			reject(err);
		});
		wr.on("close", function(ex) {
			resolve(true);
		});
		rd.pipe(wr);
	});
	return promise;
}
filetools.prototype.checksum = function(file,val){
	val = val.split(':');
	if(val.length > 1){
		var cs = val[1];
		var type = val[0];
	}else{
		var cs = val[0];
		var type = false;
	}
	const checksum = require('checksum');

	var options;
	if(type){
		options={
			algorithm:type
		}
	}else{
		options = {};
	}

	var promise = new Promise(function(resolve,reject){
		checksum.file(file,options,function (err, sum) {
			if(err){
				reject({
					file:file,
					err:err.message,
					val:val
				});
				return;
			}
			if(sum == cs){
				resolve(true);
			}else{
				reject({
					file:file,
					err:'checksum mismatch',
					val:val
				})
			}
		})
	});
	return promise;

}
module.exports=new filetools();

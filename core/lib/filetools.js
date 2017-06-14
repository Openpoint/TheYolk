"use strict";

const https = require('http');
const URL = require('url');
const fs=require('fs');
const path=require('path');
var q = require("bluebird");
var request = require('request');

const os = require("os");
if(process.Yolk){
	var message = process.Yolk.message;
}

function getMessage(){
	return process.Yolk.message;
}
var filetools = function(){

}
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
				//console.log(file);
				//console.log(err);
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
							process.Yolk.storedMesssage.message = 'Downloading '+filename;
							process.Yolk.storedMesssage.percent = Math.round((prog/size)*100);
							message = getMessage();
							if(message){
								message.send('install',process.Yolk.storedMesssage);
							}
						}).on('end', function() {

							File.end();
							if(src.checksum){
								self.checksum(file,src.checksum).then(function(data){
									done();
								},function(err){
									console.log('checksum-reject1');
									done(err.file,err.err,err.val);
								});

							}else{
								done();
							}

						});
					}else{
						done(file,"statuscode: "+res.statusCode,src.checksum);
					}
				}).on('error',function(e){
					done(file,e.message,src.checksum);
				});
			}else{
				console.log('already there');
				if(src.checksum){
					self.checksum(file,src.checksum).then(function(data){
						done();
					},function(err){
						console.log('checksum-reject2');
						console.log(err.err);
						console.log(err.file);
						console.log(err.val);
						done(err.file,err.err,err.val);
					});

				}else{
					done();
				}
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
		message = getMessage();
		if(message){
			message.send('install',process.Yolk.storedMesssage);
		}
		if(type==='tar.gz'){
			console.log('extracting tar.gz');
			const targz = require('tar.gz');

			var parse = targz().createParseStream();

			parse.on('entry', function(entry){

				if(entry.type==='Directory'){
					self.mkdir(destination,entry.path);
				}else{
					var file=path.join(destination,entry.path);
					var options = {
						mode:entry.props.mode
					}
					var File = fs.createWriteStream(file,options);
					entry.pipe(File);

				}
			});
			parse.on('end',function(){
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
					if (/\/$/.test(entry.fileName)) {
						// directory file names end with '/'
						self.mkdir(dest,entry.fileName);
						zipfile.readEntry();
					} else {
						// file entry
						console.log('file');
						zipfile.openReadStream(entry, function(err, readStream) {
							if(err){
								throw err;
							}
							// ensure parent directory exists

							self.mkdir(dest,path.dirname(entry.fileName));

							readStream.pipe(fs.createWriteStream(path.join(dest,entry.fileName)));
							readStream.on("end", function() {
								zipfile.readEntry();
							});
						});
					}
				})
				zipfile.on("end",function(){
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
	console.log('checksum');
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
			//console.log(cs);
			//console.log(sum);
			if(sum == cs){
				resolve(true);
			}else{
				console.log('rejected');
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

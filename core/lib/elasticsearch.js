"use strict"
/*
 * Create a javascript Elasticsearch client and perform various database operations
 *
 * */

const q = require('promise');
const elasticsearch = require('elasticsearch');
const {ipcRenderer} = require('electron');
const def = {
	"settings":{
		"index" : {
			"number_of_shards" : 1,
			"number_of_replicas" : 0
		}
	}
}

//var dbaseReady = false;

var dbase = function(){
	this.client = new elasticsearch.Client({
		host: 'http://localhost:9200',
	});
}
dbase.prototype.exists = function(index){
	var self = this;
	var promise = new q(function(resolve,reject){
		index = index.split('.');

		if(index.length === 1){
			function exists(){
				self.client.indices.exists({
					index:index[0],
					local:true,
					maxRetries:1,
					requestTimeout:500
				}).then(function(data){
					resolve(data);
				},function(err){
					exists();
				});
			}
			exists();

		}else{
			function exists(){
				self.client.indices.existsType({
					index:index[0],
					type:index[1],
					local:true,
					maxRetries:1,
					requestTimeout:500
				}).then(function(data){
					resolve(data);
				},function(err){
					exists();
				});
			}
			exists();
		}

	})
	return promise;
}
dbase.prototype.create = function(Index,Mapping,Settings,Body){
	var self = this;
	if(!Body){
		Body = def;
	}

	var done = new q(function(resolve,reject){
		new function(index,mapping,settings,body,res){
			if(settings){
				Object.keys(settings).forEach(function(key){
					body.settings[key]=settings[key]
				})
			}
			return self.client.indices.create({
				index:index,
				body:body
			},function(err,mess){
				if(err){
					console.log(err)
					reject(err);
				}else{
					index = index.split('.');
					if(index.length > 1 && mapping){
						//console.log(index);
						self.client.indices.putMapping({
							index:index[0],
							type:index[1],
							body:mapping
						},function(err2,mess2){
							if(err){
								console.log(err2);
							}else{
								res(mess);
							}
						})
					}else{
						res(mess);
					}
				}
			})
		}(Index,Mapping,Settings,Body,resolve)
	})

	return done;
}
dbase.prototype.get = function(path){
	var self = this;
	var result = new q(function(resolve,reject){
		path = path.split('.');
		var location = {
			index:path[0],
			type:path[1],
			id:path[2]
		}
		self.client.get(location,function(err,data){
			if(err){
				if(err.status === 404){
					resolve(false);
				}
				reject(err);
			}else{
				resolve(data['_source']);
			}
		})
	})
	return result;
}

//dbase.prototype.fetch = function(index,types,query,flags){
dbase.prototype.fetch = function(search){
	var self = this;

	var result = new q(function(resolve,reject){

		/*
		var search = {
			index:index,
			type:types
		}
		if(query){
			search.q = query;
		}
		if(flags && flags.size){
			search.size = flags.size;
		}
		if(flags && flags.from){
			search.from = flags.from;
		}

		if(flags && flags.sort && flags.sort.length){
			search.sort=[];
			flags.sort.forEach(function(flag){
				if(flag.field){
					var field = '.'+flag.field;
				}else{
					var field='';
				}
				var sort= flag.term+field+":"+flag.dir;
				search.sort.push(sort)
			})
		}else if(flags && flags.sort){
			if(flags.sort.field){
				var field = '.'+flags.sort.field;
			}else{
				var field='';
			}
			search.sort = flags.sort.term+field+":"+flags.sort.dir;
		}
		*/


		self.client.search(search,function(err,data){

			if(!err){
				var hits = data.hits.hits.map(function(hit){
					return hit['_source'];
				})
				//console.log(data.hits.hits)
				resolve({
					items:hits,
					libsize:data.hits.total
					});
			}else{
				console.error(err);
			}
		})

	});
	return result;
}
//find the position of a track in a search result
dbase.prototype.findPos = function(index,types,query,flags,id){
	var self = this;
	this.id = id;
	var result = new q(function(resolve,reject){
		var len = 0;
		var search = {
			index:index,
			type:types,
			q:query,
			scroll:'1m',
			size:1000
		}
		if(flags && flags.sort){
			if(flags.sort.field){
				var field = '.'+flags.sort.field;
			}else{
				var field='';
			}
			search.sort=flags.sort.term+field+":"+flags.sort.dir;
		}
		self.client.search(search,function getMore(err,data){
			if(err){
				reject(err);
			}
			data.hits.hits.forEach(function(hit){
				if(self.id === hit['_source'].id){
					resolve(len);
					self.done = true;
				}
				len++;
			});
			if(data.hits.total !== len && !self.done){
				self.client.scroll({
					scrollId: data._scroll_id,
					scroll: '1m'
				},getMore);
			}else{
				reject('no index found')
			}
		})
	})
	return result;
}
//dbase.prototype.fetchAll = function(path,query,sort,hash){
dbase.prototype.fetchAll = function(query){

	var self = this;
	query.scroll = '1m';
	query.size = 1000;

	var result = new q(function(resolve,reject){
		var all = [];
		var len = 0;
		self.client.search(query,function getMore(err,data){

			if(!err){
				data.hits.hits.forEach(function(hit){
					all.push(hit._source);
					len++;
				});
				if(data.hits.total !== len){
					self.client.scroll({
						scrollId: data._scroll_id,
						scroll: '1m'
					},getMore);
				}else{
					resolve(all);
				}
			}else{
				console.log(err)
				reject(err);
			}
		});
	})
	return result;
}

dbase.prototype.put = function(path,body){

	path = pathSplit(path);

	var create = {
		index:path[0],
		body:body
	}
	if(path[1]){
		create.type = path[1]
	}
	if(path[2]){
		create.id = path[2]
	}

	return this.client.create(create);
}
dbase.prototype.update = function(path,body){

	path = pathSplit(path);

	var update = {
		index:path[0],
		refresh:true,
		retry_on_conflict:2,
		body:{
			doc:body
		}
	}
	if(path[1]){
		update.type = path[1]
	}
	if(path[2]){
		update.id = path[2]
	}

	return this.client.update(update);
}
dbase.prototype.delete = function(path){
	path = path.split('.');
	if (path.length !== 3){
		return false;
	}
	return this.client.delete({
		index:path[0],
		type:path[1],
		id:path[2],
		refresh:true
	})
}
dbase.prototype.nuke = function(){
	console.log('Database is nuked - hope you are happy now.....');
	return this.client.indices.delete({index:'_all'})
}

dbase.prototype.listIndexes=function(){
	var self = this;
	var result = new q(function(resolve,reject){

		self.client.cat.indices({
				h:'i'
		}).then(function(data){
			var indexes = data.replace(/\s+/g, ' ').trim().split(' ');
			resolve(indexes);
		});
	})
	return result;
}
if(!db){
	var db = new dbase();
}


var pathSplit = function(path){
	path = path.split('.');
	return path;
}
/*
var init = {}
init.ready = function(){
	dbaseReady = true;
	return db;
}
init.ping = new q(function(resolve, reject){

	var p = function(){
		if(!dbaseReady){
			if(ipcRenderer){
				ipcRenderer.send('dbasestate');
			}
			setTimeout(function(){
				p();
			},500);
		}else{
			resolve(db);
		}
	}
	p();
})
if(ipcRenderer){
	ipcRenderer.on('dbasestate',function(event,data){
		dbaseReady = data;
	});
}
*/
module.exports = db;

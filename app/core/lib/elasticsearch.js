"use strict"

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

/*
 * Create a javascript Elasticsearch client and perform various database operations
 *
 * */

const q = require("bluebird");
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


var dbase = function(){
	this.client = new elasticsearch.Client({
		host: 'http://localhost:9200',
	});
}
dbase.prototype.exists = function(index){
	var self = this;
	return new Promise(function(resolve,reject){
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
}

//create a new index
dbase.prototype.create = function(hash){
	var self = this;

	if(!hash.body.settings){
		hash.body.settings = {};
	}
	Object.keys(def.settings).forEach(function(key){
		hash.body.settings[key] = def.settings[key]
	})

	return new Promise(function(resolve,reject){
		self.client.indices.create(hash,function(err,data){
			if(err){
				reject(err);
			}else{
				resolve(data)
			}
		})
	})
}

//fetch a single document by path
dbase.prototype.get = function(path){
	var self = this;
	return new Promise(function(resolve,reject){
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

}

//get a formatted object with array of search results by hash query
dbase.prototype.fetch = function(query){
	var self = this;
	return new Promise(function(resolve,reject){
		self.client.search(query,function(err,data){

			if(!err){
				var result = data.hits.hits
				var libsize = data.hits.total
				var hits = result.map(function(hit){
					return hit['_source'];
				})
			}
			resolve({
				items:hits,
				libsize:libsize,
			});
		})

	});
}

//find the position of a track in a search result
dbase.prototype.findPos = function(index,types,query,flags,id){
	var self = this;
	this.id = id;
	var result = new Promise(function(resolve,reject){
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

dbase.prototype.fetchAll = function(query){
	var self = this;
	return new Promise(function(resolve,reject){
		query.scroll = '30s';
		query.size = 1000;
		var all = [];
		var len = 0;
		self.client.search(query,function getMore(err,data){

			if(!err){
				data.hits.hits.forEach(function(hit){

					if(!hit.inner_hits){
						all.push(hit._source);
					}else{
						var result = {_hit:hit._source};
						Object.keys(hit.inner_hits).forEach(function(key){
							result[key]=hit.inner_hits[key].hits.hits;
						})
						all.push(result)

					}
					len++;
				});

				if(data.hits.total!==len){
					self.client.scroll({
						scrollId:data._scroll_id,
						scroll:'30s',
						body:{}
					},getMore);
				}else{
					self.client.clearScroll(data._scroll_id)
					resolve(all);
				}
			}else{
				self.client.clearScroll(data._scroll_id)
				reject(err);
			}
		});
	})
}

dbase.prototype.update = function(query){
	var self = this;
	query.refresh = true;
	query.retry_on_conflict = 2;
	return new Promise(function(resolve,reject){
		self.client.update(query,function(err,data){
			if(err){
				reject(err);
			}else{
				resolve(data);
			}
		})
	})
}

dbase.prototype.nuke = function(){
	var self = this;
	return new Promise(function(resolve,reject){
		console.log('Database is nuked - hope you are happy now.....');
		self.client.indices.delete({index:'_all'},function(err,data){
			resolve();
		})
	})
}

if(!db){
	var db = new dbase();
}

module.exports = db;

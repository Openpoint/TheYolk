'use strict'
var path = require('path');

angular.module('yolk').factory('utils',['$q', function($q) {
	var elastic = require(path.join(window.Yolk.root,'core/lib/elasticsearch.js'));
	var utils = function(module){
		this.module = module;
		this.index_root;
	};
	
	//engages the database and returns a database handler object
	utils.prototype.boot = function(index,ids){
		console.log(ids);
		
		this.index_root = index;
		var self = this;
		
		
		return new $q(function(resolve,reject){
			var count = 0;

			elastic.then(function(db){
				
				self.db = db;
				
				var res=function(){
					count++
					if(count === (ids.length || 0) +1){						
						resolve(db);
					}
				}
				var check = function(index,mapping){
					db.exists(index).then(function(exists){
						if(exists){
							res();
						}else{
							db.create(index,mapping).then(function(){
								res();
							});							
						}
					});					
				}
				check(index);
				if(ids.length){
					ids.forEach(function(id){						
						check(index+'.'+id.type,id.mapping);
					});
				}				
			});
		})
	}
	
	//gets settings from file or database and returns setting data
	utils.prototype.settings = function(type){
		var self = this;
		
		return new $q(function(resolve,reject){
			self.db.fetch(self.index_root+'.settings.'+type).then(function(data){

				if(!data){
					console.log('weird bug');
					return;
				}					
				if(data && data.length){
					resolve(data[0]);					
				}else{					
					var settings = window.Yolk.modules[self.module].config.settings;
					
					var body = [];
					var count = 0;
					body.push({
						create:{
							_index: self.index_root,
							_type: 'settings',
							_id:type
						}
					})					
					for(var key in settings){
						var doc = {};
						doc[key]=settings[key];
						if(count > 0){
							body.push({
								update:{
									_index: self.index_root,
									_type: 'settings',
									_id:type
								}
							})
							body.push({doc:doc});							
						}else{
							body.push(doc);
						}
						count++;
						//body.push({title:'test',test:'more'});
						
					}
					self.db.client.bulk({body:body},function(err,data){
						if(err){
							console.log(err);
							//todo: error handling
						}else{
							console.log(data);
							resolve(window.Yolk.modules[self.module].config.settings);
						}
						
					});						
				}
			});			
		})	
	}
		
	return utils;
	
}])

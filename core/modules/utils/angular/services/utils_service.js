'use strict'
var path = require('path');

angular.module('yolk').factory('utils',['$q', function($q) {

	var elastic = require(path.join(Yolk.config.root,'core/lib/elasticsearch.js'));
	
	var utils = function(module){
		this.db = elastic.ready();
		this.module = module;
		this.index_root;
	};
	
	//engages the database and returns a database handler object
	utils.prototype.boot = function(index,ids){	
		
		this.index_root = index;
		var self = this;
		
		
		return new $q(function(resolve,reject){
			var count = 0;
			
			elastic.ping.then(function(){
								
				var res=function(){
					count++
					
					if(!ids || count === ids.length){						
						resolve(self.db);
					}
				}
				var check = function(index,mapping){
					self.db.exists(index).then(function(exists){	
											
						if(exists){
							res();
						}else{
							self.db.create(index,mapping).then(function(){
								res();
							},function(err){
								console.log(err);
							});							
						}
					});					
				}
				
				self.db.exists(index).then(function(exists){
					
					if(exists){
						go();
					}else{
						self.db.create(index).then(function(){
							go();
						});							
					}
				});
				
				function go(){
					
					if(ids && ids.length){
						ids.forEach(function(id){					
							new check(index+'.'+id.type,id.mapping);
						});
					}else{
						res();
					}					
				}
								
			},function(err){
				console.log(err);
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
					var settings = Yolk.config.modules[type].config.settings;
					if(Object.keys(settings).length){
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
								resolve(false);
							}
							
						});						
					}else{
						resolve(false);
					}
					
						
				}
			});			
		})	
	}
		
	return utils;
	
}])

'use strict'

angular.module('yolk').factory('search',['$timeout',function($timeout) {
	var $scope;
	const tools = require('../../lib/tools/searchtools.js');
	const crypto = require('crypto');

	var search = function(scope){
		$scope = scope;
		this.fields = tools.fields;

		var self = this;
		var searchTime;
		$scope.$watch('searchTerm',function(oldVal,newVal){
			if($scope.searchTerm && $scope.searchTerm.length){
				$('#search .hide').html($scope.searchTerm);
				$('#search input').width($('#search .hide').width()+10+'px');
			}else{
				$('#search input').width('100px')
			}

			if(oldVal!==newVal){
				if($scope.searchTerm && $scope.searchTerm.length > 1){
					$scope.goSearch = true;
				}else{
					$scope.goSearch = false;
				}
				$timeout.cancel(searchTime);
				//$timeout.cancel($scope.iaTimer);
				//$timeout.cancel($scope.ytTimer);
				searchTime = $timeout(function(){
					self.go();
				},500);
			}
		});
	}
	search.prototype.clear = function(){
		$timeout(function(){
			$scope.searchTerm = '';
			$('#search input').focus();
		})
	}


	//process the search term into a database query string
	search.prototype.searchString = function(term,pre){

		if(!pre){
			pre='metadata';
		}
		var self = this;
		var q='(';
		var terms = {};


		var prefix = tools.clean(term);
		this.fields.filter(function(field){
			if(term.split(field+':')[1]){
				terms[field] = tools.clean(term.split(field+':')[1]);
			};
		});
		for(var term in terms){
			if(terms[term]){
				var fuzz = tools.fuzzy(terms[term]);
				q=q+pre+'.'+term+':"'+fuzz+'" AND ';
			}
			//console.log(q);
		}
		q=q.trim();
		q=q.split(' ');
		if(q[q.length -1] === 'AND'){
			q.pop();
		}
		q = q.join(" ");
		q=q+") "
		if(q ==='() '){
			q='';
		}
		if(prefix.length){
			var fields = ['title','artist','album','description'];
			var term = tools.fuzzy(prefix);
			fields.forEach(function(field){
				q=q+pre+'.'+field+':"'+term+'" ';
			})
			q=q+'description:"'+term+'"';
		}
		return q;
	}


	search.prototype.go = function(deleted){

		if(!$scope.sources.length){
			return;
		}
		var q='((';
		$scope.sources.filter(function(source){
			q = q+'_type:'+source+' '
		});
		if(!deleted){
			q=q+') AND deleted:"no")'
		}else{
			q=q+') AND deleted:"yes")'
		}

		if($scope.searchTerm && $scope.searchTerm.length > 1){
			var more = this.searchString($scope.searchTerm);

			if(more.length){
				q=q+' AND (';
				q = q + more + ')';

			}
		}

		$scope.db.fetch($scope.db_index,q,$scope.sortby).then(function(data){
			$scope.allTracks = data;
			$scope.tracks.Filter();
			$timeout(function(){
				$scope.lazy.refresh($('#playwindow').scrollTop());
			});
		})

	}

	//process the query into external searches
	search.prototype.remoteSearch = function(search_id,e){

		if(e && e.which !== 13){
			return;
		}

		if($scope.pinned.sources.indexOf('online')===-1){
			$scope.pin.pin('source','online');
		}
		var search_id = crypto.createHash('sha1').update(search_id).digest('hex');
		var sources = $scope.sources.filter(function(source){
			if(source!=='local'){
				return true;
			}
		})

		if(sources.length){
			this.search_id = search_id;
			var self = this;
			$scope.db.client.get({
				index:$scope.db_index,
				type:'searches',
				id:search_id
			},function(err,data){
				$scope.goSearch = false;
				if(err){
					var body={};
					body.time = {};
					sources.forEach(function(source){
						if(source!=='local'){
							body.time[source]= Date();
							Tools.remote_search(source);
						}
					})
					$scope.db.put($scope.db_index+'.searches.'+search_id,body).then(function(data){
						//console.log(data);
					},function(err){
						console.log(err);
					})
				}else{

					sources.forEach(function(source){
						if(data._source.time[source]){
							if($scope.utils.dateDiff(Date(),data._source.time[source],'minutes') > 10){
								Tools.remote_search(source);
								Tools.update(source,self.search_id);
							}else{
								console.log($scope.utils.dateDiff(Date(),data._source.time[source],'minutes'))
							}
						}else{
							Tools.remote_search(source);
							Tools.update(source,self.search_id);
						}
					})
				}
			})
		}
	}
	var Tools = {
		remote_search:function(source){
			if($scope[source]&&$scope[source].search){
				$scope[source].search($scope.searchTerm);
			}
		},
		update:function(type,id){
			var body = {};
			body.time = {};
			body.time[type]=Date();
			$scope.db.update($scope.db_index+'.searches.'+id,body).then(function(data){
				console.log('updated')
				console.log(data);
			})
		}
	}

	return search;
}])

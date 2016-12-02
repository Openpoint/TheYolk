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
			$('#search .hide').html($scope.searchTerm);
			$('#search input').width($('#search .hide').width()+10+'px');
			if(oldVal!==newVal){

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

		if($scope.searchTerm){
			$scope.searchTerm = $scope.searchTerm.trim();
		}
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
							if(Tools.dateDiff(new Date(),data._source.time[source],'minutes') > 10){
								Tools.remote_search(source);
								Tools.update(source,self.search_id);
							}else{
								console.log(Tools.dateDiff(new Date(),data._source.time[source],'minutes'))
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
		// a and b are javascript Date objects
		dateDiff:function (a,b,period) {
			b = new Date(b);
			switch(period){
				case 'days':
					period = 1000 * 60 * 60 * 24;
				break;
				case 'hours':
					period = 1000 * 60 * 60;
				break;
				case 'minutes':
					period = 1000 * 60;
				break;
				default:
					period = 1000 * 60 * 60 * 24;
			}
			var utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate(), a.getHours(), a.getMinutes());
			var utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate(), b.getHours(), b.getMinutes());

			return Math.floor((utc2 - utc1) / period*-1);
		},
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

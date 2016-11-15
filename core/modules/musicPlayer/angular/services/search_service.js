'use strict'

angular.module('yolk').factory('search',['$timeout',function($timeout) {
	var $scope;
	var tools = require('../../lib/tools/searchtools.js');
	
	var search = function(scope){
		$scope = scope;
		this.fields = tools.fields;
		
		var self = this;
		var searchTime;
		$scope.$watch('searchTerm',function(oldVal,newVal){
			if(oldVal!==newVal){
				$timeout.cancel(searchTime);
				$timeout.cancel($scope.iaTimer);
				$timeout.cancel($scope.ytTimer);
				searchTime = $timeout(function(){
					self.go();								
				},500);			
			}
		});
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
				var fuzz = tools.fuzzyAnd(terms[term]);
				q=q+pre+'.'+term+':('+fuzz+') AND ';				
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
			q=q+'"'+tools.fuzzy(prefix)+'"';
		}
		return q;		
	}
		
	search.prototype.go = function(stop_ia){

		if(!$scope.sources.length){
			return;
		}
		var q='(';
		$scope.sources.filter(function(source){
			q = q+'_type:'+source+' '
		});
		q = q+')';
				
		if($scope.searchTerm && $scope.searchTerm.length > 1){
			var more = this.searchString($scope.searchTerm);
			
			if(more.length){
				q=q+' AND (';
				q = q + more;
				q = q +')'
			}
			
			if(!stop_ia){				
				$scope.internetarchive.search($scope.searchTerm);
				$scope.youtube.search($scope.searchTerm);
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
	
	return search;
}])

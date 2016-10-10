'use strict'

angular.module('yolk').factory('search',['$timeout',function($timeout) {
	var $scope;
	
	var search = function(scope){
		$scope = scope;
		var self = this;
		var searchTime;
		$scope.$watch('searchTerm',function(oldVal,newVal){
			if(oldVal!==newVal){
				$timeout.cancel(searchTime);
				searchTime = $timeout(function(){
					self.go();								
				},500);			
			}
		});
	}
	
	search.prototype.searchString = function(term){
		
		var q='';
		var fields = [
			'artist','album','title'
		];
		var terms = {};
		
		function clean(term){
			fields.filter(function(field){
				term = term.split(field+':')[0];
			});
			return term;
		};
		function fuzzy(term){
			var fuzzy = [];
			fuzzy = term.split(' ');
			fuzzy = fuzzy.join('~ ');
			fuzzy = fuzzy.trim();
			if(fuzzy[fuzzy.length -1] !== '~'){
				fuzzy = fuzzy+'~';
			}
			return fuzzy;
		}
		var prefix = clean(term);
		fields.filter(function(field){
			if(term.split(field+':')[1]){
				terms[field] = clean(term.split(field+':')[1]);
			};
		});
		for(var term in terms){
			
			if(terms[term]){
				
				var fuzz = fuzzy(terms[term]);
				q=q+'metadata.'+term+':('+fuzz+')^4 '
			}
			
		}
		if(prefix.length){
			q=q+fuzzy(prefix);
		}

		return q;
		
	}
	
	search.prototype.go = function(){
		
		if($scope.searchTerm.length > 1){

			var q = this.searchString($scope.searchTerm);
			
			
			$scope.db.fetch($scope.db_index,q).then(function(data){

				$scope.allTracks = data;
				$timeout(function(){
					$scope.tracks.Filter();
				});
				
			})

		}else{
			$scope.db.fetch($scope.db_index+'.local').then(function(data){
				$scope.allTracks = data;
				$timeout(function(){
					$scope.tracks.Filter();
				});
			})
		}
	}
	
	return search;
}])

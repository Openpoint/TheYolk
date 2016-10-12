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
		var qia='';
		var fields = [
			'artist','album','title'
		];
		var fields_ia = [
			'title',
			'identifier',
			'description',
			'creator'
		];
		var terms = {};
		function compress(term){
			return term.replace(/ /g,'').toLowerCase()+'~';
		};
		function clean(term){
			fields.filter(function(field){
				term = term.split(field+':')[0];
			});
			return term;
		};
		function fuzzy(term){
			var fuzzy = [];
			term = term.trim();
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
				q=q+'metadata.'+term+':('+fuzz+')^4 ';
				fields_ia.filter(function(index){
					if(index === 'identifier'){
						qia = qia+index+':'+compress(terms[term])+'^4 ';
					}else{
						qia = qia+index+':"'+fuzz+'"^4 ';
					}
					
				});
				
			}
			
		}
		if(prefix.length){
			q=q+fuzzy(prefix);
			qia=qia+'description:"'+fuzzy(prefix)+'"';
		}

		return {
			q:q,
			qia:qia
		};
		
	}
	
	search.prototype.go = function(){
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
			if(more.q.length){
				q=q+' AND (';
				q = q + more.q;
				q = q +')'
			}

			$scope.internetarchive.search(more.qia);
		}
		$scope.db.fetch($scope.db_index,q).then(function(data){
			$scope.allTracks = data;						
			$timeout(function(){
				$scope.tracks.Filter();
			});			
		})

	}
	
	return search;
}])

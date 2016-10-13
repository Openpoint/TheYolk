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
				$timeout.cancel($scope.iaTimer);
				searchTime = $timeout(function(){
					self.go();								
				},500);			
			}
		});
	}
	search.prototype.compress = function(term){
		return term.replace(/ /g,'').toLowerCase();
	}
	search.prototype.searchString = function(term){
		
		var q='';
		var qia='(';
		var fields = [
			'artist','album','title'
		];
		var fields_ia = [
			'title',
			'description'
		];
		var terms = {};

		function clean(term){
			fields.filter(function(field){
				term = term.split(field+':')[0];
			});
			if (term){
				term = strip(term);
			}
			return term;
		};
		function fuzzy(term){
			var fuzzy = [];
			term = strip(term);
			fuzzy = term.split(' ');
			fuzzy = fuzzy.join('~ ');
			fuzzy = fuzzy.trim();
			if(fuzzy[fuzzy.length -1] !== '~'){
				fuzzy = fuzzy+'~';
			}
			return fuzzy;
		}
		function strip(term){
			if(term){		
				term = term.replace(/[^\w\s]/gi,'');
				term=term.trim().toLowerCase();
				term = term.replace(/ +(?= )/g,'');
				if(term.length && term!==' ' && term !=='unknown'){
					return term;
				}else{
					return false;
				}
			}else{
				return false;
			}
		}
		var prefix = clean(term);
		fields.filter(function(field){
			if(term.split(field+':')[1]){
				terms[field] = clean(term.split(field+':')[1]);
			};
		});
		for(var term in terms){
			qia =qia+'(';
			if(terms[term]){				
				var fuzz = fuzzy(terms[term]);
				q=q+'metadata.'+term+':('+fuzz+')^4 ';
				fields_ia.filter(function(index){
					if(index === 'title'){
						qia = qia+index+':"'+fuzz+'"^4 OR ';	
					}else{
						qia = qia+index+':"'+fuzz+'" OR ';
					}
										
				});
				qia = qia.trim();
				var lastIndex = qia.lastIndexOf(" OR");
				qia = qia.substring(0, lastIndex);
				
			}
			/*

			* */
			qia =qia+') OR ';			
		}

		if(qia.length > 1){
			qia = qia.trim();
			var lastIndex = qia.lastIndexOf(" OR");
			qia = qia.substring(0, lastIndex);			
		}

		
		if(prefix.length){
			if(qia.length !== 1){
				qia =qia+' OR '
			}
			q=q+fuzzy(prefix);
			qia=qia+'description:"'+fuzzy(prefix)+'" OR title:"'+fuzzy(prefix)+'"^4)';
		}else{
			qia=qia+')'
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

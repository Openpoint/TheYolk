'use strict'

angular.module('yolk').factory('pin',['$timeout',function($timeout) {
	var $scope;
	var pin = function(scope){
		$scope = scope;
		$scope.pinned = {
			sources:[],
			oldSources:['local']
		};
		$scope.sources = [];
	}
	pin.prototype.pin = function(type,name){
		if(type === 'source'){
			if($scope.pinned.sources.indexOf(name) > -1){
				if(name === 'suggestions'){
					$scope.pinned.sources = $scope.pinned.oldSources;
				}else{
					if($scope.pinned.sources.length > 1){
						$scope.pinned.sources.splice($scope.pinned.sources.indexOf(name),1);
					}else{
						return;
					}
				}
				
			}else{
				if(name === 'suggestions'){
					$scope.pinned.oldSources = $scope.pinned.sources;
					$scope.pinned.sources = ['suggestions']
				}else{
					if($scope.pinned.sources.indexOf('suggestions') > -1){
						$scope.pinned.sources.splice($scope.pinned.sources.indexOf('suggestions'),1);
					}					
					$scope.pinned.sources.push(name);
				}
				
			}

			$scope.sources=[];
			$scope.pinned.sources.filter(function(pin){
				switch(pin){
					
					case 'local':
						$scope.sources.push('local');
						break;
					case 'online':
						$scope.sources.push('jamendo');
						$scope.sources.push('internetarchive');
						break;
						
					case 'suggestions':
						$scope.sources=[];
						$scope.jamendo.pop().then(function(data){
							$scope.allTracks = data;
							$scope.tracks.Filter();
						});						
						break;
					case 'torrents':
						$scope.sources.push('torrents');
						break;
										
				}				
			});
			$scope.search.go();		
			return;
			
		}else{

			if(type === 'artist'){
				$scope.pinned.album = false;
			}else{
				$scope.pinned.artist = false;
			}
			
			if(!$scope.pinned[type] || $scope.pinned[type] != name){
				//filter by type
				if(!$scope.pinned.scrollTop){
					$scope.pinned.scrollTop = $('#playwindow').scrollTop();
					
				}
				
				$scope.pinned[type] = name;
				$('#playwindow').scrollTop(0);
				$scope.tracks.Filter();
				$timeout(function(){				
					$scope.lazy.refresh($('#playwindow').scrollTop());
				});		
				
				
			}else{
				//return to full track listing
				$scope.pinned[type] = false;				
				
				//$scope.scrolling = true;
				$scope.tracks.Filter();

				$timeout(function(){
					$scope.lazy.refresh($scope.pinned.scrollTop);
					$scope.pinned.scrollTop = false;
				});			
				
				
				
			}			
		}		
	}
	return pin;
}])

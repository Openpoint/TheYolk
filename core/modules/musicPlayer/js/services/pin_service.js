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
				}				
			});

			if($scope.sources.length){
				$scope.tracks.getTracks($scope.sources);
			}else{
				$scope.allTracks = [];
				$scope.tracks.Filter();
			}		
			return;
		}else if($scope.pinned.sources[0] !== 'suggestions'){
			console.log($scope.pinned.sources);
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
				if($('#playwindow').scrollTop()){
					$('#playwindow').scrollTop(0);
				}else{
					$scope.tracks.Filter();
				}
						
				
				
			}else{
				//return to full track listing
				$scope.pinned[type] = false;				
				
				//$scope.scrolling = true;
				$scope.tracks.Filter();
				var top = $scope.pinned.scrollTop;
				$timeout(function(){
					$('#playwindow').scrollTop(top);
				});			
				$scope.pinned.scrollTop = false;
				
				
			}			
		}		
	}
	return pin;
}])

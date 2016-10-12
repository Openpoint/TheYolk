"use strict"
angular.module('yolk').factory('tracks',['$q','$filter','$timeout', function($q,$filter,$timeout) {
	var $scope;
	var body = [];
	var q = [];
	var Process;




	
	var tracks = function(scope){
		$scope = scope;
	}
	function process(){
		$scope.lib.loading=true;
		q = q.filter(function(data){
			var action = {index:{
				_index:$scope.db_index,
				_type:data.data.type,
				_id:data.data.id
			}}
			var info = data.data;
			body.push(action);
			body.push(info);
			$scope.allTracks.push(info);
					
		});

		$scope.db.client.bulk({
			body: body
		},function(err,data){
			console.log('batch');
			$scope.tracks.Filter();
			$scope.lazy.refresh($('#playwindow').scrollTop());
		})
	};
	tracks.prototype.add = function(data){
		q.push(data);
		if(q.length > 150){
			process();
		}
		$timeout.cancel(Process);
		Process=$timeout(function(){
			process();
		},500);
		
		//var string = $scope.db_index+'.'+data.data.type+'.'+data.data.id;
		

		
		
		return;
		$scope.db.put(string,data.data).then(function(meta){
			count++;
			$scope.lib.tracks.push(data.data);
			if(count < 150){
				$timeout.cancel(refresh);
			}else{
				count=0;
			}			
			refresh = $timeout(function(){
				$scope.lib.loading=false;			
				$scope.lazy.refresh($('#playwindow').scrollTop());
			},500);			
		});		
	};
	/*
	tracks.prototype.getTracks = function(){
		var types = $scope.sources;
		if(types.length){
			var q = '';
			types.filter(function(type){
				q=q+'_type:'+type+' ';
			});
			console.log(q);
			
			if($scope.searchTerm && $scope.searchTerm.length){
				console.log($scope.search.searchString($scope.searchTerm));
				
			}
				
			$scope.db.fetch($scope.db_index,q).then(function(data){
				//console.log(data);
				$scope.allTracks = data;
				$scope.tracks.Filter();
				$scope.lazy.refresh();
				

			
			})
		}else{
			$scope.allTracks = [];
			this.Filter();
			$scope.lazy.refresh();			
		}
	}
	* */
	tracks.prototype.Filter = function(){
		$scope.lib.tracks = $filter('tracks')($scope);
		if($scope.allTracks.length){
			//$scope.lib.tracks = $filter('tracks')($scope);
		}else{
			//$scope.lib.tracks = [];
		}
		
	}
	tracks.prototype.checkLocal = function(index){
		if($scope.settings.paths.musicDir){
			$scope.db.fetch($scope.db_index,'_type:'+index).then(function(data){

				ipcRenderer.send('verify', {
					dir:$scope.settings.paths.musicDir, 
					tracks:data
				});				
			})					
		}
	}
	tracks.prototype.verify = function(data){

		if(data.remove.length){
			var body = [];
			data.remove.forEach(function(track){
				body.push({
					delete:{ 
						_index:$scope.db_index,
						 _type:'local', 
						 _id:track.id
					}
				});
				$scope.lib.tracks = $scope.lib.tracks.filter(function(ltrack){
					if(ltrack.id !== track.id){
						return true;
					}
				});
			});

			$scope.db.client.bulk({
				body:body
			},function(err,data){
				console.log(data);
			})
		}		
	}
	return tracks;	
}])

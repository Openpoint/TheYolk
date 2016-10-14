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
		//console.log('start queue process');
		$scope.lib.loading=true;
		q = q.filter(function(data){
			var action = {index:{
				_index:$scope.db_index,
				_type:data.type,
				_id:data.id
			}}
			var info = data;
			body.push(action);
			body.push(info);					
		});

		$scope.db.client.bulk({
			body: body
		},function(err,data){
			//console.log('end queue process');
			$timeout(function(){
				$scope.search.go(true);
			},1000);

		})
	};
	function compare(foo,bar,type){
		
		if(!foo.metadata){
			console.log('foo');
			console.log(foo);
		}

		if(!bar.metadata){
			console.log('bar');
			console.log(bar);
		}
		
		var title_foo = $scope.search.sanitise(foo.metadata.title);
		var title_bar = $scope.search.sanitise(bar.metadata.title);
		var artist_foo = $scope.search.sanitise(foo.metadata.artist);
		var artist_bar = $scope.search.sanitise(bar.metadata.artist);
		
		if(trace){
			console.log(type+'____________'+title_foo+':'+title_bar);
		}

		if(title_foo === title_bar && artist_foo === artist_bar){
			return true;
		}else{
			return false;
		}		
	};
	function proceed(newtrack){
		if(newtrack){
			q.push(newtrack);
		}
		
		if(q.length > 150){
			process();
		}
		
		Process=$timeout(function(){
			process();
		},500);			
		
	};
	function checkq(track){
		if(trace){
			console.log(q.length);
		}
		for(var i = 0; i< q.length; i++){
			if(trace){
				console.log(i);
			}
			if(!track){
				console.log('------------------------ 1 -----------------------------------------');
			}
			if (compare(track,q[i],'queue')){						
				return true;
			}else{
				return false;
			}

		}		
	};
	function indbase(track,trace_1){

		var q = $q.defer();
		
		var query='(';
		$scope.data_sources.filter(function(source){
			query = query+'_type:'+source+' '
		});
		query = query+') AND metadata.title:('+$scope.search.fuzzy(track.metadata.title)+') AND metadata.artist:('+$scope.search.fuzzy(track.metadata.artist)+')';		
		if(trace_1){
			console.log(query);
		}
		$scope.db.fetch($scope.db_index,query).then(function(found){
			if(trace_1){
				console.log(found);
			}
			if(found.length){
				for(var i=0;i<found.length;i++){
					if(!track){
						console.log('------------------------ 2 -----------------------------------------');
					}
					if (compare(track,found[i],'found')){
						q.promise.resolve(true);						
						break;
						return;
					};
				}
				q.resolve(false);
			}else{
				q.resolve(false);
			}
		});	
		
		return q.promise;
	}
	
	var trace;
	
	tracks.prototype.add = function(track){
		$timeout.cancel(Process);		
		if(track.type==='local'){
			proceed(track);
		}else{
			if (track.metadata.title === 'Bob Dylan’s Dream'){
				console.log('trace');
				trace=true;
			}else{
				trace=false;
			}
			if(q.length){
				var inqueue = checkq(track);
			}else{
				var inqueue = false;
			}
			
			if(trace){
				console.log('inqueue: '+inqueue);
			}
			if(!inqueue){
				indbase(track,trace).then(function(isin){
					if(trace){
						console.log('indbase: '+isin);
					}
					if(!isin){
						proceed(track);
					}
				});
			}
		}
	};

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

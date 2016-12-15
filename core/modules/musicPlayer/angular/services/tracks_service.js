"use strict"
angular.module('yolk').factory('tracks',['$q','$filter','$timeout', function($q,$filter,$timeout) {

	var $scope;
	var body = [];
	var q = [];
	var Process;
	var tools = require('../../lib/tools/searchtools.js');

	var tracks = function(scope){
		$scope = scope;
		$scope.sort = function(type,field,deleted){
			$scope.showDeleted = deleted;
			var key = type.split('.').pop();
			if(!$scope.Sortby[key]){
				$scope.Sortby[key]={};
			}
			$scope.Sortby[key].term = type;
			$scope.Sortby[key].field = field;

			if(!$scope.Sortby[key].dir){
				$scope.Sortby[key].dir = 'asc'
			}else if($scope.Sortby[key].dir === 'desc'){
				$scope.Sortby[key].dir = 'asc'
			}else{
				$scope.Sortby[key].dir = 'desc'
			}

			$scope.sortby = $scope.Sortby[key];
			$scope.search.go(deleted);
		}
	}
/*
	//timer to set sane pace for bulk database submissions
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


	//process the queued tracks into a bulk database submission
	function process(){
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
			$timeout(function(){
				$scope.search.go();
			},1000);

		})
	};

	//compare two track details to check if they are the same
	function compare(foo,bar,type){

		if(!foo.metadata){
			console.log('foo');
			console.log(foo);
		}

		if(!bar.metadata){
			console.log('bar');
			console.log(bar);
		}

		var title_foo = tools.sanitise(foo.metadata.title);
		var title_bar = tools.sanitise(bar.metadata.title);
		var artist_foo = tools.sanitise(foo.metadata.artist);
		var artist_bar = tools.sanitise(bar.metadata.artist);
		var album_foo = tools.sanitise(foo.metadata.album);
		var album_bar = tools.sanitise(bar.metadata.album);

		if(title_foo === title_bar && artist_foo === artist_bar && album_foo === album_bar){
			return true;
		}else{
			return false;
		}
	};


	//check if new track is already queued for database submission
	function checkq(track){
		for(var i = 0; i< q.length; i++){
			if (compare(track,q[i],'queue')){
				return true;
			}else{
				return false;
			}
		}
	};

	//check if a new track already exists in the database
	function indbase(track){

		var q = $q.defer();

		if(!track.metadata.title || !track.metadata.artist){
			q.resolve(true);
		}

		var query='(';
		$scope.data_sources.filter(function(source){
			query = query+'_type:'+source+' '
		});
		query = query+') AND metadata.title:('+tools.fuzzy(track.metadata.title)+') AND metadata.artist:('+tools.fuzzy(track.metadata.artist)+')';

		$scope.db.fetch($scope.db_index,query).then(function(found){
			if(found.length){
				for(var i=0;i<found.length;i++){
					if (compare(track,found[i],'found')){

						q.resolve(true);
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


	//Add a track to the database
	tracks.prototype.add = function(track){
		$timeout.cancel(Process);
		if(track.type==='local'){
			indbase(track).then(function(isin){
				if(!isin){
					proceed(track);
				}
			});
		}else{

			if(q.length){
				var inqueue = checkq(track);
			}else{
				var inqueue = false;
			}

			if(!inqueue){
				indbase(track).then(function(isin){
					if(!isin){
						proceed(track);
					}
				});
			}
		}
	};
	*/
	//delete a track
	tracks.prototype.delete = function(type,id,playing){
		if(playing){
			$scope.audio.next();
		}
		$scope.db.update($scope.db_index+'.'+type+'.'+id,{
			deleted:"yes",
			date:Date.now()
		}).then(function(data){
			$timeout(function(){
				$scope.search.go();
			})

		})
	}
	//undelete a track
	tracks.prototype.undelete = function(type,id,playing){
		if(playing){
			$scope.audio.next();
		}
		$scope.db.update($scope.db_index+'.'+type+'.'+id,{
			deleted:"no",
			date:Date.now()
		}).then(function(data){
			$timeout(function(){
				$scope.search.go(true);
			})

		})
	}
	//Apply pin and source filters to the active array of tracks
	tracks.prototype.Filter = function(){
		$scope.lib.tracks = $filter('tracks')($scope);
	}

	//Send database tracks to be verified against local file system
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

	//Sync filesystem file removals to database
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

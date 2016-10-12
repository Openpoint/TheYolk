'use strict';

angular.module('yolk').factory('internetarchive',['$http','$timeout','filters',function($http,$timeout,filters) {

	//var internetarchive = $q.defer();
	
	const {ipcRenderer} = require('electron');

	const path = require('path');
	const crypto = require('crypto');

	var $scope;
	
	var q = {
		queries:[],
		meta:[]
	};

	var ia = function(scope){
		$scope = scope;	
	}
	var timeout;	
	ia.prototype.search = function(term){
		$timeout.cancel(timeout);
		var query=term+' AND mediatype:audio AND collection:opensource_audio&fl[]=title,identifier,description,creator&rows=10&page=1&output=json';
		var self = this;
		timeout = $timeout(function(){
			console.log(query);
			return;					
			$http({
				method:'GET',
				url: 'https://archive.org/advancedsearch.php?q='+query,
			}).then(function successCallback(response){
				var result = response.data.response.docs;
				console.log(result);
				/*
				var thisQ = q.queries.shift();
				if(!response.data.items.length && !q.meta.length){
					self.search();
				}
				* */
				if(result.length){
					result.forEach(function(item){
						/*
						item = {
							item:item,
							filter:thisQ.filter
						}
						* */
					
						if(!q.meta.length){
							q.meta.push(item);
							//self.getMeta();
						}else{
							q.meta.push(item);
						}

					});
				}
			});
		},1500);		
	}
	
	ia.prototype.getFiles = function(data,root){
		var types = $scope.settings.fileTypes;
		root = 'https://archive.org/download/'+root+'/';
		
		var self = this;
		//self.filter = filter;
		
		
		data.files.forEach(function(file){
			//console.log(file);
			var track = self.format(file,root);
			if(types.indexOf(path.extname(file.name).toLowerCase()) > -1 && file['external-identifier'] && file['external-identifier'].length > 1){
				//console.log(file);
				
				var ids={};
				if(Array.isArray(file['external-identifier'])){
					
					file['external-identifier'].forEach(function(tid){
						var id = tid.split(':');

						if(id[id.length-1] !== 'unknown'){
							ids[id[1]]=id[2];
						}
					});
				}else{
					var id = file['external-identifier'].split(':');
					if(id[id.length-1] !== 'unknown'){
						ids[id[1]]=id[2];
					}
				}
				
				if(ids.mb_recording_id){
					console.log(track);
					$scope.tracks.add(track);
					return;
					ipcRenderer.send('musicbrainz', {
						id:ids.mb_recording_id,
						track:track,
						filter:self.filter
					});
					
				}else{
					//no MusicBrainz ID found for the track
					console.log(track);
					$scope.tracks.add(track);
				}
			}else if(types.indexOf(path.extname(file.name).toLowerCase()) > -1 && file.artist && file.title){
				console.log(track);
				$scope.tracks.add(track);
				//Not of playable type or does not contain MusicBrainz ID
				//self.noExtid(file,filter,root);
			}
			
		});
		
		q.tracks
	};
	
	ia.prototype.format=function(file,root){

		var track={
			metadata:{
				artist:file.artist,
				album:file.album,
				title:file.title
			},
			id:crypto.createHash('sha1').update(root+file.name).digest('hex'),
			file:root+file.name,
			download:root+file.name,
			path:'',
			filter:{},
			type:'internetarchive'
		}
		var track={
			count:0,
			total:0,
			data:track
		};
		return track;			
	}
	/*
	ia.prototype.noExtid = function(track,filter,root){
		if(filters[filter.funct](filter.value,track.artist)){
			var track =  this.format(track,root);

			ipcRenderer.send('MBtrack', {
				track:track,
				filter:filter
			});
		};			
	}
	* */
	
	//get the full details of the specific found item, including track file listing
	ia.prototype.getMeta = function(){
		var self = this;
		//var src = q.meta[0].item;
		var src = q.meta[0].identifier;
		
		//var filter = q.meta[0].filter;
		var url = 'https://archive.org/metadata/'+src;
		$http({
			method:'GET',
			url: url
		}).then(function successCallback(response){	
			//console.log(response);
			q.meta.shift();
			if(q.meta.length){
				self.getMeta();
			}else if(q.queries.length){
				//self.search();
			}
	
			self.getFiles(response.data,src);
		});		
	}

	return ia;	
}])

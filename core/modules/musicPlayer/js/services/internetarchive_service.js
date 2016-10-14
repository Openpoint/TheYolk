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
		this.max_tracks = 100; //maximum amount of tracks in a found item - cuts out some strange crap
	}
	var timeout;	
	ia.prototype.search = function(term){

		
		var query=term+' AND mediatype:audio AND collection:opensource_audio&fl[]=title,identifier,description,creator&rows=200&page=1&output=json';
		var self = this;
		$scope.iaTimer = $timeout(function(){
			var id = $scope.search.compress(term);
			id = crypto.createHash('sha1').update(id).digest('hex');
			
			//console.log(query);
			
			$scope.db.put($scope.db_index+'.search.'+id,{time:Date.now()}).then(function(data){
				$http({
					method:'GET',
					url: 'https://archive.org/advancedsearch.php?q='+query,
				}).then(function successCallback(response){
					var result = response.data.response.docs;
					
					if(result.length){
						result.forEach(function(item){						
							if(!q.meta.length){
								q.meta.unshift(item);
								self.getMeta();
							}else{
								q.meta.unshift(item);
							}

						});
					}
				});
				
			

			},function(err){
				//console.log(err.message);
			});					
			
		},2000);		
	}
	
	ia.prototype.getFiles = function(data,root){
		var types = $scope.settings.fileTypes;
		root = 'https://archive.org/download/'+root+'/';
		
		var self = this;
		var goodfiles = [];
		var sequential = [];
		var seqCount = 0;
		data.files.filter(function(file){
			
			if(types.indexOf(path.extname(file.name).toLowerCase()) > -1 && file.title){
				var term = file.title.replace(/[^A-Za-z]/g,'');
				if(sequential.indexOf(term) === -1){
					sequential.push(term);
				}else{
					seqCount++
				}
				goodfiles.push(file);
			}
		});
		//console.log('sequential:'+seqCount);
		//console.log('goodfiles:'+goodfiles.length);
		
		//abort the batch if too many files or too many file repeats, ie a sequentional list of same name files
		if(goodfiles.length > this.max_tracks || (seqCount && goodfiles.length - seqCount < 5)){
			return;
		}
		
		
		goodfiles.forEach(function(file){
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
					track.musicbrainz_id = ids.mb_recording_id;
					ipcRenderer.send('musicbrainz',track);
					
				}else if(file.artist && file.title){
					//no MusicBrainz ID found for the track
					ipcRenderer.send('musicbrainz',track);
				}
			}else if(types.indexOf(path.extname(file.name).toLowerCase()) > -1 && file.artist && file.title){
				//does not contain MusicBrainz ID
				ipcRenderer.send('musicbrainz',track);
			}
			
		});
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

		return track;			
	}

	
	//get the full details of the specific found item, including track file listing
	ia.prototype.getMeta = function(){
		var self = this;
		//var src = q.meta[0].item;
		var src = q.meta[0].identifier;

		$scope.progress.internetarchive = q.meta.length
		
		var url = 'https://archive.org/metadata/'+src;
		$http({
			method:'GET',
			url: url
		}).then(function successCallback(response){	
			//console.log(response);
			q.meta.shift();
			$scope.progress.internetarchive = q.meta.length
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

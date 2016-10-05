angular.module('yolk').factory('internetarchive',['$http','filters',function($http,filters) {
	console.log(filters);
	//var internetarchive = $q.defer();
	
	const {ipcRenderer} = require('electron');
	const types = require('../../settings.json').fileTypes;
	const path = require('path');
	const crypto = require('crypto');


	var q = {
		queries:[],
		meta:[]
	};

	function internetarchive(term,filter){

		var ia = function(term){
			var fuzzyterm = '"';
			var query='?q=(';
			var zipterm= term.replace(/ /g,'')+'~';
			//console.log(zipterm);
			var split = term.split(' ');
			for (var i = 0; i < split.length; i++){
					query = query+'title:'+split[i]+'^4 OR ';
					query = query+'identifier:'+split[i]+'^2 OR ';
				if(i < split.length-1){
					fuzzyterm = fuzzyterm + split[i]+'~ '
				}else{
					fuzzyterm = fuzzyterm + split[i]+'~"';
				}
			}
			var qEnd = ") AND mediatype:audio AND collection:opensource_audio&fields=title,description,indentifier&count=400"
			
			var queries = {
				artist:'?q=(creator:'+fuzzyterm+qEnd
			}

			if(filter && queries[filter.funct]){
				query = queries[filter.funct];
			}else{
				query = query+fuzzyterm+' OR title:'+zipterm+'^5 OR identifier:'+zipterm+'^10 ) AND mediatype:audio AND collection:opensource_audio&fields=title,description,indentifier&count=400';
			}
			
			
			//query = '?q="radiohead" AND mediatype:audio AND collection:opensource_audio&fields=title,description,indentifier&count=400'
			//console.log(query);
			
			var item = {
				query:query,
				filter:filter
			}
			
			if (!q.queries.length){
				console.log('search');
				q.queries.push(item);
				this.search();
			}else{
				q.queries.push(item);
				//console.log(q.length);
			}
		
		}
			
		ia.prototype.search = function(){
			
			var self = this;
			if(q.queries.length){
				var query = q.queries[0].query;
			}else{
				return;
			}
			$http({
				method:'GET',
				url: 'https://archive.org/services/search/v1/scrape'+query,
			}).then(function successCallback(response){
				
				var thisQ = q.queries.shift();
				if(!response.data.items.length && !q.meta.length){
					self.search();
				}
				response.data.items.forEach(function(item){
					
					item = {
						item:item,
						filter:thisQ.filter
					}
					
					if(!q.meta.length){
						q.meta.push(item);
						self.getMeta();
					}else{
						q.meta.push(item);
					}
				});
			});		
		}
		ia.prototype.getFiles = function(data,root,filter){
			root = 'https://archive.org/download/'+root+'/';
			
			var self = this;
			self.filter = filter;
			
			
			data.files.forEach(function(file){
				if(types.indexOf(path.extname(file.name).toLowerCase()) > -1 && file['external-identifier'] && file['external-identifier'].length > 1){
					
					
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
						
						var track = self.format(file,root);

						//console.log(track);
						ipcRenderer.send('musicbrainz', {
							id:ids.mb_recording_id,
							track:track,
							filter:self.filter
						});
						
					}else{
						//no MusicBrainz ID found for the track
						self.noExtid(file,filter,root);
					}
				}else if(types.indexOf(path.extname(file.name).toLowerCase()) > -1 && file.artist && file.title){
					//Not of playable type or does not contain MusicBrainz ID
					self.noExtid(file,filter,root);
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
				downloads:file.downloads,
				path:''
			}
			return track;			
		}
		
		ia.prototype.noExtid = function(track,filter,root){
			if(filters[filter.funct](filter.value,track.artist)){
				var track =  this.format(track,root);

				ipcRenderer.send('MBtrack', {
					track:track,
					filter:filter
				});
			};			
		}
		//get the full details of the specific found item, including track file listing
		ia.prototype.getMeta = function(){
			var self = this;
			var src = q.meta[0].item;
			var filter = q.meta[0].filter;
			var url = 'https://archive.org/metadata/'+src.identifier;
			$http({
				method:'GET',
				url: url
			}).then(function successCallback(response){	
				//console.log(response);
				q.meta.shift();
				if(q.meta.length){
					self.getMeta();
				}else if(q.queries.length){
					self.search();
				}
						
				self.getFiles(response.data,src.identifier,filter);
			});		
		}
				
		new ia(term);
	}	
	return internetarchive;	
}])

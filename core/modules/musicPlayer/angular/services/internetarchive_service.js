'use strict';

angular.module('yolk').factory('internetarchive',['$http','$timeout',function($http,$timeout) {

	const {ipcRenderer} = require('electron');
	const path = require('path');
	const crypto = require('crypto');

	var $scope;
	var tools = require('../../lib/tools/searchtools.js');

	var q = {
		queries:[],
		meta:[],
		sources:[],
		running:false
	};

	var ia = function(scope){
		var self = this;
		$scope = scope;
		$scope.progress.internetarchive = 0;
		this.searches = [];
		this.queries = [];
		this.max_duration = 30*60*1000 //maximum track length in milliseconds
		$scope.db.client.get({index:$scope.db_index,type:"internetarchivesearch",id:"queries"},function(err,data){
			if(!err){
				self.queries = data._source.queries
			}
		})
	}

	//submit a search to the internetarchive server	and get a list of identifiers
	ia.prototype.search = function(term){
		var self = this;
		var queries = self.searchString(term);
		this.musicbrainz(queries.qdb,0);
		var query = 'https://archive.org/advancedsearch.php?q='+queries.qia;
		$http({method:'GET',url:query,}).then(function(response){
			var result = response.data.response.docs;
			if(result.length){
				q.meta.unshift({
					query:queries.qdb,
					blocks:result
				});
				$scope.progress.internetarchive = $scope.progress.internetarchive+result.length;
				if(!q.running) self.getMeta();
			}
		},function(err){
			console.error(err);
		});
	}
	//process the query to a database search string
	ia.prototype.searchString = function(term){
		var hash = tools.terms(term);
		var qdb = {index:$scope.db_index,type:"internetarchivesearch",body:{query:{bool:{must:[
			{bool:{should:[]}},
			{match:{'musicbrainzed':{query:'no'}}}
		]}}}}
		if (hash.prefix){
			qdb.body.query.bool.must[0].bool.should.push({multi_match:{query:hash.prefix,operator : "and",fuzziness:'auto',fields:['title','artist','album'],}})
		}
		tools.fields.forEach(function(field){
			if(hash[field]){
				var match = {};
				match[field] = {query:hash[field],fuzziness:'auto',operator:'and'}
				qdb.body.query.bool.must.push({match:match})
			}
		})
		var qia='(title:('+tools.queryBuilder(term,{boost:10})+') OR title:"'+tools.queryBuilder(term,{fuzzy:true})+'" OR subject:('+tools.queryBuilder(term,{boost:10})+') OR subject:"'+tools.queryBuilder(term,{fuzzy:true})+'") AND (description:('+tools.queryBuilder(term,{boost:10})+') OR description:"'+tools.queryBuilder(term,{fuzzy:true})+'")'
		var excludes = {
			podcast:'-podcast -podcasts',
			cover:'-cover -covers',
			tribute:'-tribute -tributes',
			bootleg:'-bootleg -bootlegs',
			live:'-live',
			set:'-set',
			radio:'-radio',
			mix:'-mix -remix'
		}
		var compare = tools.strim(term);
		var exclude = [];
		Object.keys(excludes).forEach(function(key){
			if(compare.indexOf(key)===-1){
				exclude.push(excludes[key])
			}
		})
		exclude = exclude.join(' ');
		qia = qia+' AND title:('+exclude+') AND description:('+exclude+') AND subject:('+exclude+') AND mediatype:audio &fl[]=downloads&fl[]=title,subject,collection,identifier,description,creator AND collection:opensource_audio&sort[]=downloads desc&rows=1000&page=1&output=json';
		var searchstrings = {qia:qia,qdb:qdb}
		return searchstrings;
	};

	//get the full details of the specific found identifier, including track file listing
	ia.prototype.getMeta = function(){
		var self = this;
		if (q.meta.length){
			var src = q.meta[0].blocks.shift();
			src = src.identifier;
			function proceed(){
				if(!q.meta[0].blocks.length){
					q.meta.shift();
					if(!q.meta.length){
						q.running = false;
					}else{
						q.running = true;
					}
				}else{
					q.running = true;
				}
				self.getMeta();
			}
			if(this.queries.indexOf(src) !== -1){
				$scope.progress.internetarchive	--;
				proceed();
				return;
			}else{
				this.queries.push(src);
			}
			var query = q.meta[0].query;
			var url = 'https://archive.org/metadata/'+src;
			//console.log(url);
			$http({
				method:'GET',
				url: url
			}).then(function(response){
				$scope.progress.internetarchive	--;
				if(response.data.files) var files = self.getFiles(response.data.files);
				if(files){
					var bulk=[];
					files.forEach(function(file){
						var newfile = {};
						newfile.title = file.title;
						newfile.artist = file.artist;
						newfile.album = file.album;
						newfile.musicbrainz_id = file.musicbrainz_id;
						newfile.musicbrainzed ='no';
						newfile.name = encodeURIComponent(file.name);
						newfile.dir = encodeURIComponent(response.data.metadata.identifier);
						if(file.length) newfile.duration = tools.duration(file.length)
						var id='https://archive.org/download/'+newfile.dir+'/'+newfile.name;
						var id = crypto.createHash('sha1').update(id).digest('hex');
						newfile.id = id;
						newfile.internetarchive = src;
						bulk.push({create:{_index:$scope.db_index,_type:'internetarchivesearch',_id:id}});
						bulk.push(newfile);
					});
					//put the found files to database
					if(bulk.length){
						$scope.db.client.bulk({body:bulk,refresh:true},function(err,response){
							if(err){
								console.error(err);
							}else{

								$scope.db.client.update({index:$scope.db_index,type:"internetarchivesearch",id:"queries",refresh:true,body:{
									doc: {
										queries: self.queries
									},
									doc_as_upsert:true
								}},function(err,data){
									if(err) console.error(err);
								})
								self.musicbrainz(query,1000);
							}
						});
					}
				}
				proceed()
			},function(err){
				$scope.progress.internetarchive	--;
				proceed()
			});
		}else{
			console.log('Finished Meta');
			q.meta = [];
			q.running = false;
		}
	}
	//check if file has musicbrainz id
	ia.prototype.gotId = function(file){
		if(file['external-identifier'] && file['external-identifier'].length > 1){
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
				file.musicbrainz_id = ids.mb_recording_id;
				return file;
			}else{
				return file;
			}
		}else{
			return file;
		}
	};

	//filter the list of files and return a list of desired files
	ia.prototype.getFiles = function(files){
		var types = $scope.settings.fileTypes;
		var self = this;
		var newfiles = [];
		var goodfiles = [];
		var sequential = [];
		var seqCount = 0;
		var seqSkip = 0;
		var group = {};

		files.forEach(function(file){
			var split = file.name.split('.');
			var ext = split.pop();
			if(['xml','torrent','txt','png','jpg','bmp','gz'].indexOf(ext)>-1){return}
			var name = split.join('')
			if(!group[name]) group[name]={}
			if(!group[name][ext]) group[name][ext]=file;
		})
		Object.keys(group).forEach(function(track){
			var file = {};
			Object.keys(group[track]).forEach(function(type){
				if(group[track][type].artist) file.artist = group[track][type].artist;
				if(group[track][type].album) file.album = group[track][type].album;
				if(group[track][type].title) file.title = group[track][type].title;
				if(group[track][type].length) file.length = group[track][type].length;
				if(group[track][type]['external-identifier']) file['external-identifier']=group[track][type]['external-identifier'];
			})
			file = self.gotId(file);
			delete file['external-identifier'];

			types.some(function(type){
				if(group[track][type]){
					file.name = group[track][type].name
					return true;
				}
			})
			if(file.name){
				newfiles.push(file);
			}
		})

		newfiles.forEach(function(file){
			if(
				((!tools.gibberish(file.title)) &&
				(!tools.gibberish(file.artist)) &&
				(!file.length || tools.duration(file.length) <= self.max_duration))||
				file.musicbrainz_id
			){
				if(file.title){
					var term = file.title.replace(/[^A-Za-z]/g,'');
					if(sequential.indexOf(term) === -1){
						sequential.push(term);
					}else{
						seqCount++
					}
				}else{
					seqSkip++
				}
				if(!file.title && !file.artist){
					//console.error(file.name+' : '+file.musicbrainz_id);
				}else if(file.title && !file.artist){
					//console.warn(file.title+' : '+file.name+' : '+file.musicbrainz_id);
				}else{
					//console.log(file)
				}
				goodfiles.push(file);
			}else{
				//console.error(file)
			}
		});

		//abort the batch if too many files or too many file repeats, ie a sequentional list of same name files
		if(!goodfiles.length || (seqCount && goodfiles.length +seqSkip - seqCount < 5)){
			//console.error(goodfiles)
			return false;
		}else{
			return goodfiles;
		}
	};

	//format a file object into a track object for pushing to musicbrainz
	ia.prototype.format=function(file){
		var root = path.join('https://archive.org/download/',file.dir,file.name);
		var track={
			metadata:{
				artist:file.artist,
				album:file.album,
				title:file.title
			},
			id:file.id,
			file:root,
			duration:file.duration,
			download:root,
			path:'',
			filter:{},
			musicbrainz_id:file.musicbrainz_id,
			type:'internetarchive'
		}
		if(file.musicbrainz_id){
			track.musicbrainz_id = file.musicbrainz_id;
		}
		return track;
	}

	//fetch the query from the local database and submit to musicbrainz for querying
	ia.prototype.musicbrainz = function(query,timeout){
		var self = this;
		$timeout(function(){
			$scope.db.fetchAll(query).then(function(data){
				data.forEach(function(track){

					if(self.searches.indexOf(track.id) === -1){
						self.searches.push(track.id);
						var file = self.format(track);
						ipcRenderer.send('musicbrainz',file);
					}
				});
			},function(err){
				console.error(err);
			});
		},timeout);

	}
	return ia;
}])

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
		$scope = scope;
		$scope.progress.internetarchive = 0;
		this.searches = [];
		this.queries = [];
		this.max_duration = 30*60*1000 //maximum track length in milliseconds
	}

	//process the query to a database search string
	ia.prototype.searchString = function(term){
		var hash = tools.terms(term);
		var qdb = {
			index:$scope.db_index,
			type:"internetarchivesearch",
			body:{
				query:{
					bool:{
						must:[
							{bool:{should:[]}},
							{match:{'musicbrainzed':{
								query:'no'
							}}}
						]
					}
				}
			}
		}
		if (hash.prefix){
			qdb.body.query.bool.must[0].bool.should.push({
				multi_match:{
					query:hash.prefix,
					operator : "and",
					fuzziness:'auto',
					fields:['title','artist','album'],
				}
			})
		}
		tools.fields.forEach(function(field){
			if(hash[field]){
				var match = {};
				match[field] = {
					query:hash[field],
					fuzziness:'auto',
					operator:'and'
				}
				qdb.body.query.bool.must.push({
					match:match
				})
			}
		})

		var qia='(';
		var fields_ia = [
			'title',
			'description',
			'subject'
		];
		var terms = {};
		var prefix = tools.clean(term);
		if(term.toLowerCase().indexOf(' cover ') > -1 || term.toLowerCase().indexOf('cover ') === 0){
			var cover = ''
		}else{
			var cover = ' -cover -covers'
		}
		if(term.toLowerCase().indexOf(' bootleg ') > -1 || term.toLowerCase().indexOf('bootleg ') === 0){
			var bootleg = ''
		}else{
			var bootleg = ' -bootleg -bootlegs'
		}
		tools.fields.forEach(function(field){
			if(term.split(field+':')[1]){
				terms[field] = tools.clean(term.split(field+':')[1]);
			};
		});

		for(var term in terms){
			qia = qia+'(';
			if(terms[term]){
				fields_ia.forEach(function(index){
					if(index === 'title'){
						var boost = 10;
					}else if(index === 'subject'){
						var boost = 5;
					}else{
						var boost = 2;
					}

					var Boost = tools.boost(terms[term],boost,true)
					Boost = tools.uri(Boost);
					var Fuzzy = tools.fuzzy(terms[term],false,true)
					Fuzzy = tools.uri(Fuzzy);
					qia = qia+index+':('+Boost+') OR ';
					qia = qia+index+':"'+Fuzzy+'" OR ';
				});
				qia = qia.trim();
				var lastIndex = qia.lastIndexOf(" OR");
				qia = qia.substring(0, lastIndex);
				//qdb = qdb+term+':'+'('+tools.fuzzyAnd(terms[term],10)+') AND ';

			}
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

			fields_ia.forEach(function(index){
				if(index === 'title'){
					var boost = 10;
				}else if(index === 'subject'){
					var boost = 5;
				}else{
					var boost = 2;
				}
				var Boost = tools.boost(prefix,boost,true)
				Boost = tools.uri(Boost);
				var Fuzzy = tools.fuzzy(prefix,false,true)
				Fuzzy = tools.uri(Fuzzy)
				qia = qia+index+':('+Boost+') OR ';
				qia = qia+index+':"'+Fuzzy+'" OR ';
			})
			var lastIndex = qia.lastIndexOf(" OR ");
			qia = qia.substring(0, lastIndex)+') ';

		}else{
			qia=qia+')';

		}

		qia = qia+' AND title:(-podcast'+cover+bootleg+') AND description:(-podcast'+cover+bootleg+') AND subject:(-podcast'+cover+bootleg+') AND mediatype:audio &fl[]=title,subject,collection,identifier,description,creator AND collection:opensource_audio&rows=100&page=1&output=json';
		//qdb = '('+qdb+') AND musicbrainzed:no'

		this.musicbrainz(qdb,0);

		var searchstrings = {
			qia:qia,
			qdb:qdb
		}

		return searchstrings;
	};


	//submit a search to the internetarchive server	and get a list of identifiers
	ia.prototype.search = function(term){

		var self = this;

		var queries = self.searchString(term);
		var query = 'https://archive.org/advancedsearch.php?q='+queries.qia;

		$http({
			method:'GET',
			url:query,
		}).then(function(response){
			var result = response.data.response.docs;
			if(result.length){
				//console.log(result);
				q.meta.unshift({
					query:queries.qdb,
					blocks:result
				});
				$scope.progress.internetarchive = $scope.progress.internetarchive+result.length;
				if(!q.running){
					self.getMeta();
				}
			}
		},function(err){
			console.log(err);
		});
	}

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
						self.getMeta();
					}
				}else{
					q.running = true;
					self.getMeta();
				}
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
			$http({
				method:'GET',
				url: url
			}).then(function(response){
				//console.log(response.data.files);
				$scope.progress.internetarchive	--;
				var files = self.getFiles(response.data.files);
				if(files){

					var bulk=[];
					files.forEach(function(file){

						if(tools.duration(file.length) <= self.max_duration && !tools.gibberish(file.title) && !tools.gibberish(file.artist) ){

							var newfile = {};
							newfile.title = file.title;
							newfile.artist = file.artist;
							newfile.album = file.album;
							newfile.musicbrainz_id = file.musicbrainz_id;
							newfile.musicbrainzed ='no';
							newfile.name = encodeURIComponent(file.name);
							newfile.dir = encodeURIComponent(response.data.metadata.identifier);
							newfile.duration = tools.duration(file.length)
							var id='https://archive.org/download/'+newfile.dir+'/'+newfile.name;
							var id = crypto.createHash('sha1').update(id).digest('hex');

							newfile.id = id;
							bulk.push({create:{_index:$scope.db_index,_type:'internetarchivesearch',_id:id}});
							bulk.push(newfile);

							//console.log(newfile);
						}
					});
					//put the found files to database
					//console.log(bulk);
					if(bulk.length){
						$scope.db.client.bulk({body:bulk},function(err,response){
							if(err){
								console.log(err);
								console.log(bulk);
							}
						});
					}


				}
				self.musicbrainz(query,1000);
				proceed()
			},function(err){
				$scope.progress.internetarchive	--;
				proceed()
			});
		}else{
			console.log('Finished Meta');
			$scope.progress.internetarchive	--;
			self.musicbrainz(query,1000);
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
		var goodfiles = [];
		var sequential = [];
		var seqCount = 0;

		files.forEach(function(file){
			if(types.indexOf(path.extname(file.name).toLowerCase()) > -1 && !tools.gibberish(file.title) && !tools.gibberish(file.artist)){

				var term = file.title.replace(/[^A-Za-z]/g,'');
				if(sequential.indexOf(term) === -1){
					sequential.push(term);
				}else{
					seqCount++
				}
				var goodfile = self.gotId(file);

				goodfiles.push(goodfile);
			}
		});

		//abort the batch if too many files or too many file repeats, ie a sequentional list of same name files
		if(!goodfiles.length || (seqCount && goodfiles.length - seqCount < 5)){
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
				console.log(err);
			});
		},timeout);

	}
	return ia;
}])

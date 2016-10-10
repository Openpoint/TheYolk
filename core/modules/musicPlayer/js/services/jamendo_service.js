'use strict'

angular.module('yolk').factory('jamendo',['$http','$q','utils',function($http,$q,utils) {

	
	/*
	filters.add('jamendo',function(){
		console.log('jamendo');
	});
	* */
	const path = require('path');	
	const {ipcRenderer} = require('electron');
	var popTracks=[];
	var $scope;
	
	var jamendo = function(scope){
		$scope = scope;
	}
	
	//get the popular Jamendo tracks
	jamendo.prototype.pop = function(){
		var pop = $q.defer();
		var artists=[];
		
		//return Jamendo recommended from memory;
		if(popTracks.length){
			setTimeout(function(){
				pop.resolve(popTracks);
			});
			
		}else{
			
			//wait 1hr before hitting Jamendo for recommended tracks again
			setTimeout(function(){
				popTracks = [];
			},1000*60*60);

			$http({
				method: 'GET',
				url: 'https://api.jamendo.com/v3.0/tracks/?client_id=56d30c95&format=jsonpretty&limit=200&order=popularity_month&speed=high+veryhigh&include=musicinfo&groupby=artist_id'
			}).then(function successCallback(response) {

				var len = response.data.results.length;
				var count = 0;
				var count2 = 0;
				var trackq=[];
				response.data.results.forEach(function(track){
					trackq[count] = track
					count++;
					$scope.db.fetch($scope.db_index+'.jamendo.'+'jamendo'+track.id).then(function(data){
						
						//get track from db or add if new
						if(data[0]){
							var gtrack = data[0];
							count2++;
						}else{
							
							var thisTrack = trackq[count2];
							count2++;
							
							var gtrack = {
								id:'jamendo'+thisTrack.id,
								file:thisTrack.audio,
								path:'',
								download:thisTrack.audiodownload,
								type:'jamendo',
								filter:{},
								metadata:{
									album:thisTrack.album_name,
									artist:thisTrack.artist_name,
									title:thisTrack.name
								}
							};
							var gtrack2={
								count:count2,
								total:count,
								data:gtrack
							};
							$scope.tracks.add(gtrack2);							
						}

						popTracks.push(gtrack);
						if(count === count2){
							pop.resolve(popTracks);
						}						
					});										
				});
			}, function errorCallback(response) {
				// called asynchronously if an error occurs
				// or server returns response with an error status.
			});	

		}
		return pop.promise;		
	}

	return jamendo;
	
	
}])


//https://archive.org/advancedsearch.php?q=bunny+AND+licenseurl:[http://creativecommons.org/a+TO+http://creativecommons.org/z]&fl[]=identifier,title,mediatype,collection&rows=15&output=json&callback=IAE.search_hits

'use strict'

angular.module('yolk').factory('jamendo',['$http','$q','internetarchive','filters',function jamendo($http,$q,internetarchive,filters) {
	
	filters.add('jamendo',function(){
		console.log('jamendo');
	});
	const path = require('path');
	
	var jamendo = $q.defer();
	var allTracks=[];
	var artists=[];



	$http({
		method: 'GET',
		url: 'https://api.jamendo.com/v3.0/tracks/?client_id=56d30c95&format=jsonpretty&limit=200&order=popularity_month&speed=high+veryhigh&include=musicinfo&groupby=artist_id'
	}).then(function successCallback(response) {
		//console.log(response.data.results);
		response.data.results.forEach(function(track){
			//console.log(track);
			allTracks.push({
				id:'jamendo'+track.id,
				file:track.audio,
				path:'',
				download:track.audiodownload,
				metadata:{
					album:track.album_name,
					artist:track.artist_name,
					title:track.name
				}
			});
			if(artists.indexOf(track.artist_name) < 0){
				var filter = {
					funct:'artist',
					value:track.artist_name
				}
				artists.push(track.artist_name);
				internetarchive(track.artist_name,filter);
			};
			
		});
		jamendo.resolve(allTracks);

		// this callback will be called asynchronously
		// when the response is available
	}, function errorCallback(response) {
		// called asynchronously if an error occurs
		// or server returns response with an error status.
	});	
	
	return jamendo.promise;
	
	

	
}])


//https://archive.org/advancedsearch.php?q=bunny+AND+licenseurl:[http://creativecommons.org/a+TO+http://creativecommons.org/z]&fl[]=identifier,title,mediatype,collection&rows=15&output=json&callback=IAE.search_hits

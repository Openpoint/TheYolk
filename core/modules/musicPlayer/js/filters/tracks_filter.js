'use strict'

angular.module('yolk').filter('tracks',[function() {

	return function(tracks,lazy,pinned,search){

		function filter(type,value){		
			tracks = tracks.filter(function(track){
				if(track.metadata[type] === value){
					return true;
				}
			});
			return tracks;
		}

		if(pinned.album){
			tracks = filter('album',pinned.album);
		}
		if(pinned.artist){
			tracks = filter('artist',pinned.artist);
		}

		lazy.libSize = tracks.length;
		
		
		if(!lazy.Step){
			lazy.step();
		}else{
			lazy.scroll();
		}
		
		var newTracks = [];
		var zebra = 'odd';
		for(var i = 0; i < tracks.length; i++){			
			if(i < lazy.Bottom && i >= lazy.Top){				
				tracks[i].filter.zebra = zebra;
				tracks[i].filter.pos = i;							
				newTracks.push(tracks[i]);
			}
			if(zebra === 'odd'){
				zebra === 'even';
			}else{
				zebra === 'odd';
			}
		}		
		return newTracks;		
	}
}])

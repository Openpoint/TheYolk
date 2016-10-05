"use strict"

var define = {
	extends:false,
	require:[
		//load services from external modules
		'utils'
	], 
	core_process:[ 
		//starts with the core process in a Node scope
		'fileTools',
		'musicbrainz'
	],
	db_index:"music_player",
	module_name:"musicPlayer",
	settings:{
		paths:{
			musicDir:"",
			dataDir:""
		},
		state:{
			state1:"",
			state2:""
		},
		fileTypes:[".mp3",".wav",".ogg"]
	}
}

module.exports = define

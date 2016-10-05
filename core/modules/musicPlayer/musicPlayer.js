"use strict"

var define = {
	extends:false,
	require:['utils'],
	core_process:[
		'fileTools',
		'musicbrainz'
	],
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

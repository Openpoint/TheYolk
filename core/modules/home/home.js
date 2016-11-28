"use strict"

var define = {
	extends:false,
	require:[
		//load services from external modules
		'utils'
	], 
	core_process:[ 
		//starts with the core process in a Node scope
	],
	//db_index:"music_player",
	module_name:"home",
	settings:{
		
	}
}

module.exports = define

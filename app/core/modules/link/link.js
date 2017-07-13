"use strict"

var define = {
	extends:false,
	require:[], //load services from external modules
	core_process:[], //starts with the core process in a Node scope, put corresponding file in modules 'lib/process' folder
	db_index:{
		index:"link",
	},
	module_name:"link",
	settings:{},
}

module.exports = define;

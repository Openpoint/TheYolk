"use strict";
const cpuStats = require('cpu-stats');

var cpu = function(){
	this.load = 0;
	this.getCPU();
}

cpu.prototype.getCPU = function(){
	var self = this;
	cpuStats(1000, function(error, result) {
		var l = 0;
		result.forEach(function(cpu){
			l+=cpu.cpu
		})
		self.load = l/result.length;
		//if(process.env.ELECTRON_ENV === 'development') console.log('LOAD: '+self.load+'%');
		self.getCPU();
	})
}

module.exports = new cpu();

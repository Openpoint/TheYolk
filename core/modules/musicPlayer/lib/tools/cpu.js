"use strict";
const cpuStats = require('cpu-stats');

var cpu = function(){
	this.load = 0;
	this.getCPU();
}
cpu.prototype.getCPU = function(){
	var self = this;
	cpuStats(5000, function(error, result) {
		var l = 0;
		result.forEach(function(cpu){
			l+=cpu.cpu
		})
		self.load = l/result.length;
		self.getCPU();
	})
}

module.exports = new cpu();

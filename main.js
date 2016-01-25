(() => {
  'use strict'
  var d3 = require('d3')
  const size = {width: 420}
  const data = [4, 8, 15, 16, 23, 42]

  d3.select('#simple')
    .selectAll('div')
    .data(data)
    .enter().append('div')
    .style('width', function (d) { return d * 10 + 'px' })
    .text(function (d) { return d })

  const x = d3.scale.linear().domain([0, d3.max(data)]).range([0, size.width])
  d3.select('#scale')
    .selectAll('div')
    .data(data)
    .enter().append('div')
    .style('width', function (d) { return x(d) + 'px' })
    .text(function (d) { return d })
})()

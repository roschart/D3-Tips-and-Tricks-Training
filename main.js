(() => {
  'use strict'
  var d3 = require('d3')
  const size = {width: 420, barHeight: 20}
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

  const chart = d3.select('#simpleSVG')
    .attr('width', size.width)
    .attr('height', size.barHeight * data.length)

  var bar = chart.selectAll('g')
    .data(data)
    .enter().append('g')
    .attr('transform', (d, i) => { return 'translate(0,' + i * size.barHeight + ')' })

  bar.append('rect')
    .attr('width', x)
    .attr('height', size.barHeight - 1)
  bar.append('text')
    .attr('x', (d) => { return x(d) - 3 })
    .attr('y', size.barHeight / 2)
    .attr('dy', '.35em')
    .text((d) => { return d })
})()

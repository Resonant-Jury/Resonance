import { describe, expect, it } from 'vitest';
import { isInternalHostName, isPublicAddress, parseIPv6 } from './ip';

// The address classifier is what keeps a link preview from reaching our own
// network. Each blocked range is tried at both ends and one address inside,
// and each neighbour across the boundary must stay reachable.

describe('IPv4', () => {
  const blocked: [string, string[]][] = [
    ['0.0.0.0/8', ['0.0.0.0', '0.0.0.1', '0.255.255.255']],
    ['10.0.0.0/8', ['10.0.0.0', '10.1.2.3', '10.255.255.255']],
    ['100.64.0.0/10', ['100.64.0.0', '100.100.100.100', '100.127.255.255']],
    ['127.0.0.0/8', ['127.0.0.1', '127.0.0.0', '127.255.255.255', '127.1.2.3']],
    ['169.254.0.0/16', ['169.254.0.0', '169.254.169.254', '169.254.255.255']],
    ['172.16.0.0/12', ['172.16.0.0', '172.20.1.1', '172.31.255.255']],
    ['192.0.0.0/24', ['192.0.0.0', '192.0.0.8', '192.0.0.255']],
    ['192.0.2.0/24', ['192.0.2.0', '192.0.2.99', '192.0.2.255']],
    ['192.88.99.0/24', ['192.88.99.0', '192.88.99.1', '192.88.99.255']],
    ['192.168.0.0/16', ['192.168.0.0', '192.168.1.1', '192.168.255.255']],
    ['198.18.0.0/15', ['198.18.0.0', '198.19.0.1', '198.19.255.255']],
    ['198.51.100.0/24', ['198.51.100.0', '198.51.100.7', '198.51.100.255']],
    ['203.0.113.0/24', ['203.0.113.0', '203.0.113.5', '203.0.113.255']],
    ['224.0.0.0/4', ['224.0.0.0', '224.0.0.251', '239.255.255.255']],
    ['240.0.0.0/4', ['240.0.0.0', '250.1.1.1', '255.255.255.254', '255.255.255.255']],
  ];
  for (const [range, addresses] of blocked) {
    it(`refuses ${range}`, () => {
      for (const address of addresses) expect(isPublicAddress(address), address).toBe(false);
    });
  }

  it('allows the addresses just outside each blocked range, and ordinary public ones', () => {
    for (const address of [
      '1.0.0.0', '1.1.1.1', '8.8.8.8', '9.255.255.255', '11.0.0.0', '100.63.255.255', '100.128.0.0', '126.255.255.255',
      '128.0.0.0', '169.253.255.255', '169.255.0.0', '172.15.255.255', '172.32.0.0', '192.0.1.0', '192.0.3.0',
      '192.88.98.255', '192.88.100.0', '192.167.255.255', '192.169.0.0', '198.17.255.255', '198.20.0.0', '198.51.99.255',
      '198.51.101.0', '203.0.112.255', '203.0.114.0', '223.255.255.255', '93.184.216.34', '142.250.80.46',
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses what is not a canonical IPv4 address at all', () => {
    for (const address of ['', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.1.1.1', '1.1.1.01', '0x7f.0.0.1', '127.1', '2130706433', '1.2.3.4/8', ' 8.8.8.8', '8.8.8.8 ']) {
      expect(isPublicAddress(address), JSON.stringify(address)).toBe(false);
    }
  });
});

describe('IPv6', () => {
  it('refuses the unspecified and loopback addresses in every spelling', () => {
    for (const address of ['::', '::1', '0:0:0:0:0:0:0:1', '0000:0000:0000:0000:0000:0000:0000:0001', '[::1]', '::0001']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('judges an IPv4-mapped address by the IPv4 inside it, in every spelling', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:7f00:1')).toBe(false);
    expect(isPublicAddress('0:0:0:0:0:ffff:7f00:1')).toBe(false);
    expect(isPublicAddress('::FFFF:7F00:0001')).toBe(false);
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false);
    expect(isPublicAddress('::ffff:a9fe:a9fe')).toBe(false);
    expect(isPublicAddress('::ffff:192.168.1.1')).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicAddress('::ffff:808:808')).toBe(true);
  });

  it('refuses the deprecated IPv4-compatible block, which hides an IPv4 address the same way', () => {
    expect(isPublicAddress('::127.0.0.1')).toBe(false);
    expect(isPublicAddress('::7f00:1')).toBe(false);
    expect(isPublicAddress('::8.8.8.8')).toBe(false);
    expect(isPublicAddress('::808:808')).toBe(false);
  });

  it('refuses NAT64 (64:ff9b::/96, which embeds an IPv4 address), discard, unique-local, link-local and multicast', () => {
    for (const address of [
      '64:ff9b::7f00:1', '64:ff9b::127.0.0.1', '64:ff9b::8.8.8.8', '64:ff9b:1::1',
      '100::', '100::1', '100:0:0:0:ffff::',
      'fc00::', 'fc00::1', 'fd00::1', 'fd12:3456:789a::1', 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      'fe80::', 'fe80::1', 'fe80::1%eth0', 'febf:ffff::1',
      'ff00::', 'ff02::1', 'ff0e::1', 'ffff::1',
      'fec0::1', // deprecated site-local: outside global unicast
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('refuses documentation, protocol-assignment and 6to4 blocks inside global unicast', () => {
    for (const address of [
      '2001:db8::', '2001:db8::1', '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
      '2001::', '2001::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:1ff:ffff::1', '2001:10::1', '2001:20::1',
      '2002::', '2002:7f00:1::1', '2002:808:808::1',
      '3fff::', '3fff:fff:ffff::1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('refuses all of the space outside global unicast', () => {
    for (const address of ['1::1', '3::1', '4000::1', '5f00::1', '8000::1', 'a000::1', 'c000::1', 'e000::1']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const address of [
      '2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001:81b::200e', '2400:cb00::1', '2620:119:35::35',
      '2001:200::1', // just above 2001::/23
      '2001:db9::1', '2001:db7::1', // either side of the documentation block
      '3ffe::1', // outside the 3fff::/20 block
      '2001:4860:4860:0:0:0:0:8888',
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses text that is not an address', () => {
    for (const address of ['2001:db8:::1', 'gggg::1', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', '::1::', 'example.com', ':::', '1::2::3']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('parses the forms an address is written in', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('1::')).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('1:2::7:8')).toEqual([1, 2, 0, 0, 0, 0, 7, 8]);
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(parseIPv6('FE80::A%en0')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 0xa]);
    expect(parseIPv6('[2001:db8::1]')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('1.2.3.4')).toBeNull();
    expect(parseIPv6('nope')).toBeNull();
  });
});

describe('names that mean "inside"', () => {
  it('refuses localhost and the special-use and intranet suffixes, with or without the root dot', () => {
    for (const name of [
      'localhost', 'LOCALHOST', 'localhost.', 'app.localhost', 'a.b.localhost.', 'printer.local', 'nas.local.',
      'metadata.google.internal', 'x.internal', 'host.localdomain', 'router.lan', 'wiki.intranet', 'a.corp', 'a.home', 'x.private', 'x.home.arpa',
    ]) {
      expect(isInternalHostName(name), name).toBe(true);
    }
  });

  it('allows ordinary names, including ones that merely contain those words', () => {
    for (const name of ['example.com', 'localhost.example.com', 'mylocal.com', 'internal.example.org', 'a.homes', 'lan.example.com', 'notlocalhost.com']) {
      expect(isInternalHostName(name), name).toBe(false);
    }
  });
});

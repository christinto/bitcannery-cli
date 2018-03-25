# should be passed through env variable
variable "digitalocean_token" {}
provider "digitalocean" {
  token = "${var.digitalocean_token}"
}

# Eugene, Sam
variable "ssh_keys" {
  type    = "list"
  default = [3601656, 17403253]
}

variable "instance_regions" {
  default = {
    "0" = "nyc1"
    "1" = "ams2"
    "2" = "sgp1"
  }
}

resource "digitalocean_droplet" "dms" {
  # Obtain your ssh_key id number via your account. See Document https://developers.digitalocean.com/documentation/v2/#list-all-keys
  count              = 3
  ssh_keys           = "${var.ssh_keys}"
  image              = "ubuntu-16-04-x64"
  region             = "${lookup(var.instance_regions, count.index)}"
  size               = "s-2vcpu-4gb"
  private_networking = false
  monitoring         = true
  backups            = false
  ipv6               = true
  name               = "${format("dms-%01d", count.index + 1)}"

  provisioner "file" {
    source      = "${format("data/dms-%01d/import.js", count.index + 1)}"
    destination = "/root/import.js"

    connection {
      type     = "ssh"
      private_key = "${file("~/.ssh/id_rsa")}"
      user     = "root"
      timeout  = "2m"
    }
  }

  provisioner "file" {
    source      = "data/dms-common/"
    destination = "/root/"

    connection {
      type     = "ssh"
      private_key = "${file("~/.ssh/id_rsa")}"
      user     = "root"
      timeout  = "2m"
    }
  }

  provisioner "remote-exec" {
    inline = [
      "sleep 10 | echo 'Sleeping for a 10 seconds'",
      "sudo apt-get update",
      "sudo apt-get install -y curl",
      "curl -sL https://deb.nodesource.com/setup_9.x | sudo -E bash -",
      "sudo add-apt-repository -y ppa:ethereum/ethereum",
      "sleep 10 | echo 'Sleeping for a 10 seconds'",
      "sudo apt-get update",
      "sudo apt-get install -y nodejs ethereum unzip build-essential"
    ]

    connection {
      type     = "ssh"
      private_key = "${file("~/.ssh/id_rsa")}"
      user     = "root"
      timeout  = "2m"
    }
  }
}

output "Public_ips" {
  value = [
    "${digitalocean_droplet.dms.*.ipv4_address}",
  ]
}

output "Names" {
  value = [
    "${digitalocean_droplet.dms.*.name}",
  ]
}

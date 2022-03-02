package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

// Node type
type Node struct {
	IP   string `json:"ip"`
	Port string `json:"port"`
	Lat string `json:"lat"`
	Lon string `json:"lon"`
}

// Coordinate  type
type Coordinate struct {
	Status      string  `json:"status"`
	Country     string  `json:"country"`
	CountryCode string  `json:"countryCode"`
	Region      string  `json:"region"`
	RegionName  string  `json:"regionName"`
	City        string  `json:"city"`
	Zip         string  `json:"zip"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	Timezone    string  `json:"timezone"`
	Isp         string  `json:"isp"`
	Org         string  `json:"org"`
	As          string  `json:"as"`
	Query       string  `json:"query"`
}

var defaultDnsSeeds = []string{
	"seed.bitcoin.sipa.be",
	"dnsseed.bluematt.me",
	"dnsseed.bitcoin.dashjr.org",
	"seed.bitcoinstats.com",
	"seed.bitnodes.io",
	"seed.bitcoin.jonasschnelli.ch",
}

func GetSeedsFromDNS(dnsSeeds []string) []Node {
	wait := sync.WaitGroup{}
	results := make(chan []net.IP)

	for _, seed := range dnsSeeds {
		wait.Add(1)
		go func(address string) {
			defer wait.Done()
			ips, err := net.LookupIP(address)
			if err != nil {
				return
			}
			results <- ips
		}(seed)
	}

	go func() {
		wait.Wait()
		close(results)
	}()

	seedsMap := make(map[string]Node)
	for ips := range results {
		for _, ip := range ips {
			// TODO: Find non-default ports
			seedsMap[ip.String()] =  Node{ip.String(), "8333","",""}
		}
	}

	// map makes nodes unique
	seeds := []Node{}
	for _, node := range seedsMap {
		seeds = append(seeds, node)
	}

	return seeds
}

func updateNodes() {
	fmt.Println("I am running task.")
}

func addNode(db *sql.DB, node Node) error {
	insertSQL := `INSERT INTO nodes(ip, port, lat, lon) VALUES (?, ?, ?, ?)`
	statement, err := db.Prepare(insertSQL)

	if err != nil {
		log.Fatalln(err.Error())
	}

	coord, err := getJson("http://ip-api.com/json/" + node.IP)

	if err != nil {
		return err
	}

	_, err = statement.Exec(node.IP, node.Port, coord.Lat, coord.Lon)
	if err != nil {
		log.Fatalln(err.Error())
	}

	return err
}

var myClient = &http.Client{Timeout: 10 * time.Second}

func getJson(url string) (Coordinate,error) {
	time.Sleep(1 * time.Second)
	var coord = Coordinate{}

	r, err := myClient.Get(url)
	defer r.Body.Close()
	if err != nil {
		return coord, err
	}

	json.NewDecoder(r.Body).Decode(&coord)

	return coord, nil
}

func setupDB() (*sql.DB, error) {

	if _, err := os.Stat("nodes.db"); os.IsNotExist(err) {
		file, err := os.Create("nodes.db")
		if err != nil {
			log.Fatal(err.Error())
		}
		file.Close()

		db, _ := sql.Open("sqlite3", "./nodes.db")
		defer db.Close()

		nodeSQL := `CREATE TABLE nodes (
		"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,		
		"ip" TEXT,
		"port" TEXT,
        "lat" TEXT,
		"lon" TEXT
	  );`

		statement, err := db.Prepare(nodeSQL)
		if err != nil {
			panic(err)
		}

		statement.Exec()

		seedNodes := GetSeedsFromDNS(defaultDnsSeeds)
		fmt.Println("Number of Nodes:  ", len(seedNodes))
		for _, node := range seedNodes {
			// TODO: Should be in one transaction
			err = addNode(db, node)
			if err != nil {
				log.Fatal(err)
			}
		}
	}

	db, err := sql.Open("sqlite3", "./nodes.db")
	if err != nil {
		return nil, fmt.Errorf("could not open db, %v", err)
	}
	return db, nil


}

func main() {

	db, err := setupDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()


	//go func() {
	//	gc := gocron.NewScheduler()
	//	gc.Every(5).Minutes().Do(updateNodes)
	//	<-gc.Start()
	//}()

	r := gin.Default()

	r.StaticFile("/globe-data-min.json", "./frontend/globe-data-min.json")

	r.StaticFile("/geocluster.js", "./frontend/geocluster.js")
	r.StaticFile("/globe.js", "./frontend/globe.js")


	r.LoadHTMLGlob("frontend/*.html")
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	r.GET("/nodes", func(c *gin.Context) {
		nodes := []Node{}

		rows, err := db.Query("SELECT ip, port, lat, lon FROM nodes ORDER BY RANDOM() LIMIT 50;")
		if err != nil {
			log.Fatal(err)
		}

		for rows.Next() {
			var n Node
			err = rows.Scan(&n.IP, &n.Port, &n.Lat, &n.Lon)
			if err != nil {
				log.Fatal(err)
			}

			nodes = append(nodes, n)
		}


		if err != nil {
			log.Fatal(err)
		}
		//need to change for security
		c.Header("Access-Control-Allow-Origin", "*")

		c.JSON(200, gin.H{
			"message": nodes,
		})
	})

	r.Run() // listen and serve on 0.0.0.0:8080 (for windows "localhost:8080")
}